// Lente clip pilot firmware for the Seeed XIAO ESP32-S3 Sense.
//
// Streams the microphone (PCM16 mono 16 kHz, 80 ms frames) to the hub over TCP and
// sends a JPEG when the BOOT button is pressed or the hub asks for one. Blinks the
// user LED when the hub sends a cue. The hub can switch the camera off (mic-only mode,
// saves battery) and pause the microphone. Wire format: protocol v2, see
// src/clip-protocol.ts: the hello declares proto/fw/codec/rate and every audio
// frame starts with an eight-byte header (u32 sequence, u32 capture ms).
//
// Setup: copy secrets.example.h to secrets.h and fill in your 2.4 GHz Wi-Fi.
// Cloud hub: copy cloud.example.h to cloud.h (git-ignored) with the hub's host and a device token;
// the clip then speaks the same frames over wss:// (one WebSocket message per frame) instead of TCP.
// Build: arduino-cli compile -b esp32:esp32:XIAO_ESP32S3:PSRAM=opi --upload -p <port> firmware/lente-clip

#include "esp_camera.h"
#include <ESP_I2S.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <string.h>
#include "secrets.h"
#if __has_include("cloud.h")
#include "cloud.h"
#endif
#ifdef HUB_CLOUD_HOST
#include <WiFiClientSecure.h>
#include "isrg-roots.h"
#define CLOUD 1
#else
#define CLOUD 0
#endif

// Camera pins for the XIAO ESP32-S3 Sense (from the core's CameraWebServer example).
#define XCLK_GPIO_NUM 10
#define SIOD_GPIO_NUM 40
#define SIOC_GPIO_NUM 39
#define Y9_GPIO_NUM 48
#define Y8_GPIO_NUM 11
#define Y7_GPIO_NUM 12
#define Y6_GPIO_NUM 14
#define Y5_GPIO_NUM 16
#define Y4_GPIO_NUM 18
#define Y3_GPIO_NUM 17
#define Y2_GPIO_NUM 15
#define VSYNC_GPIO_NUM 38
#define HREF_GPIO_NUM 47
#define PCLK_GPIO_NUM 13

#define MIC_CLK_PIN 42
#define MIC_DATA_PIN 41
#define LED_PIN 21     // user LED, active low
#define MOTOR_PIN D0   // vibration motor through an S8050 transistor (high = on); nothing happens if it is not fitted yet
#define MOTOR_PULSE_MS 300
#define BUTTON_PIN 0   // BOOT button, free to use once running
#define CAMERA_ROTATE_180 1  // 1 for the v3 case (XIAO upside down); 0 for the v1 case

static const size_t AUDIO_FRAME_SAMPLES = 1280;  // 80 ms at 16 kHz
#define DISCOVERY_PORT 7071          // UDP; see DISCOVERY_QUERY in src/clip-protocol.ts
#define DISCOVERY_WAIT_MS 600

#if CLOUD
static WiFiClientSecure hub;
#define CLOUD_PORT 443
#define WS_PING_EVERY_MS 20000  // keeps the platform proxy and NAT from dropping a paused (silent) clip
#define WS_HANDSHAKE_TIMEOUT_MS 5000
#else
static WiFiClient hub;
#endif
static WiFiUDP discovery;
static IPAddress hubIp;               // learned by discovery
static bool hubFound = false;         // false: use HUB_HOST
static uint16_t hubPort = HUB_PORT;
static SemaphoreHandle_t sendLock;
static I2SClass i2s;
static volatile bool photoRequested = false;
static volatile bool micOn = true;    // "M" / "m" from the hub: pause listening without disconnecting
static bool cameraOn = false;         // sensor actually running
static bool cameraWanted = false;     // "C" / "c" from the hub; off saves battery in mic-only mode
static uint32_t blinkUntil = 0;
static uint32_t motorUntil = 0;

#if CLOUD
// One client frame (RFC 6455): FIN and opcode, the length, a random mask, then the payload
// (a followed by b) masked in small chunks so a photo is never copied whole.
static bool wsWrite(uint8_t opcode, const uint8_t *a, size_t alen, const uint8_t *b, size_t blen) {
  size_t len = alen + blen;
  uint8_t head[14];
  size_t n = 0;
  head[n++] = 0x80 | opcode;
  if (len < 126) {
    head[n++] = 0x80 | len;
  } else if (len < 65536) {
    head[n++] = 0x80 | 126;
    head[n++] = len >> 8;
    head[n++] = len;
  } else {
    head[n++] = 0x80 | 127;
    for (int i = 7; i >= 0; i--) head[n++] = i >= 4 ? 0 : (uint8_t)(len >> (8 * i));
  }
  uint32_t key = esp_random();
  uint8_t mask[4];
  memcpy(mask, &key, 4);
  memcpy(head + n, mask, 4);
  n += 4;
  if (hub.write(head, n) != n) return false;
  uint8_t chunk[512];
  for (size_t i = 0; i < len;) {
    size_t take = len - i < sizeof(chunk) ? len - i : sizeof(chunk);
    for (size_t k = 0; k < take; k++, i++) chunk[k] = (i < alen ? a[i] : b[i - alen]) ^ mask[i & 3];
    if (hub.write(chunk, take) != take) return false;
  }
  return true;
}
#endif

// TLS is one mbedTLS context, not safe to read and write from two tasks at once:
// sendLock guards every write and, on a cloud hub, every read too.
static bool sendFrame(char type, const uint8_t *data, size_t len) {
  if (!hub.connected()) return false;
  uint8_t header[5] = {(uint8_t)type, (uint8_t)len, (uint8_t)(len >> 8), (uint8_t)(len >> 16), (uint8_t)(len >> 24)};
  xSemaphoreTake(sendLock, portMAX_DELAY);
#if CLOUD
  bool ok = wsWrite(0x2, header, 5, data, len);
#else
  bool ok = hub.write(header, 5) == 5 && hub.write(data, len) == len;
#endif
  xSemaphoreGive(sendLock);
  return ok;
}

// Runs on its own so the microphone is drained continuously, even while a photo goes out.
// Every audio frame carries an eight-byte header: u32 little-endian sequence number
// followed by u32 little-endian capture time in ms since boot, then the PCM16 samples.
// The hub uses the sequence to count lost frames and the time to place audio precisely.
static void audioTask(void *) {
  static int16_t frame[AUDIO_FRAME_SAMPLES];
  static uint8_t packet[8 + sizeof(frame)];
  static uint32_t seq = 0;
  for (;;) {
    size_t got = i2s.readBytes((char *)frame, sizeof(frame));  // keep draining even when paused
    if (got == sizeof(frame) && micOn) {
      uint32_t now = millis();
      memcpy(packet, &seq, 4);
      memcpy(packet + 4, &now, 4);
      memcpy(packet + 8, frame, sizeof(frame));
      if (sendFrame('A', packet, sizeof(packet))) seq++;
    }
  }
}

static bool initCamera() {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = Y2_GPIO_NUM; c.pin_d1 = Y3_GPIO_NUM; c.pin_d2 = Y4_GPIO_NUM; c.pin_d3 = Y5_GPIO_NUM;
  c.pin_d4 = Y6_GPIO_NUM; c.pin_d5 = Y7_GPIO_NUM; c.pin_d6 = Y8_GPIO_NUM; c.pin_d7 = Y9_GPIO_NUM;
  c.pin_xclk = XCLK_GPIO_NUM; c.pin_pclk = PCLK_GPIO_NUM; c.pin_vsync = VSYNC_GPIO_NUM; c.pin_href = HREF_GPIO_NUM;
  c.pin_sccb_sda = SIOD_GPIO_NUM; c.pin_sccb_scl = SIOC_GPIO_NUM;
  c.pin_pwdn = -1; c.pin_reset = -1;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.frame_size = FRAMESIZE_XGA;  // 1024x768: enough to read a slide
  c.jpeg_quality = 12;
  c.fb_count = 1;
  c.fb_location = CAMERA_FB_IN_PSRAM;
  c.grab_mode = CAMERA_GRAB_WHEN_EMPTY;  // only capture when asked: no overflow warnings
  if (esp_camera_init(&c) != ESP_OK) return false;
  // The v3 case holds the XIAO upside down, so the picture comes out turned 180 degrees. Flipping
  // both axes against the sensor's defaults turns it back, and the models get it upright too.
  sensor_t *s = esp_camera_sensor_get();
  if (CAMERA_ROTATE_180 && s) {
    s->set_vflip(s, !s->status.vflip);
    s->set_hmirror(s, !s->status.hmirror);
  }
  return true;
}

// Starting the sensor takes a moment and its first frames are dark while exposure settles.
static bool setCamera(bool on) {
  if (on && !cameraOn) {
    cameraOn = initCamera();
    if (!cameraOn) Serial.println("[cam] init failed");
    for (int i = 0; cameraOn && i < 4; i++) {
      camera_fb_t *warm = esp_camera_fb_get();
      if (warm) esp_camera_fb_return(warm);
    }
  } else if (!on && cameraOn) {
    esp_camera_deinit();
    cameraOn = false;
  }
  return cameraOn;
}

static void takePhoto() {
  if (!setCamera(true)) return;  // mic-only mode still allows a single photo
  camera_fb_t *fb = esp_camera_fb_get();  // the buffered frame may be stale: drop it
  if (fb) esp_camera_fb_return(fb);
  fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[cam] no frame");
  } else {
    bool ok = sendFrame('J', fb->buf, fb->len);
    Serial.printf("[cam] photo %u bytes %s\n", (unsigned)fb->len, ok ? "sent" : "not sent");
    esp_camera_fb_return(fb);
  }
  if (!cameraWanted) setCamera(false);
}

// Broadcasts "lente-hub?" and waits for "lente-hub <port>"; on a reply, remembers the sender.
static bool discoverHub() {
  if (!discovery.begin(0)) return false;
  discovery.beginPacket(IPAddress(255, 255, 255, 255), DISCOVERY_PORT);
  discovery.print("lente-hub?");
  discovery.endPacket();
  bool found = false;
  for (uint32_t start = millis(); millis() - start < DISCOVERY_WAIT_MS && !found; delay(20)) {
    if (!discovery.parsePacket()) continue;
    char reply[32] = {0};
    discovery.read(reply, sizeof(reply) - 1);
    int port = 0;
    if (sscanf(reply, "lente-hub %d", &port) == 1 && port > 0 && port < 65536) {
      hubIp = discovery.remoteIP();
      hubPort = port;
      found = hubFound = true;
    }
  }
  discovery.stop();
  Serial.printf("[hub] discovery: %s\n", found ? hubIp.toString().c_str() : "no answer");
  return found;
}

#if CLOUD
// TLS to the cloud hub, then the WebSocket upgrade on /device with the device token.
static bool connectCloud() {
  hub.setCACert(ISRG_ROOTS);
  if (!hub.connect(HUB_CLOUD_HOST, CLOUD_PORT, WS_HANDSHAKE_TIMEOUT_MS)) {
    Serial.printf("[hub] %s:%d unreachable over TLS\n", HUB_CLOUD_HOST, CLOUD_PORT);
    return false;
  }
  hub.printf("GET /device HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
             "Sec-WebSocket-Version: 13\r\nSec-WebSocket-Key: bGVudGUtY2xpcC1rZXkhIQ==\r\n"
             "Authorization: Bearer %s\r\n\r\n",
             HUB_CLOUD_HOST, HUB_DEVICE_TOKEN);
  hub.setTimeout(WS_HANDSHAKE_TIMEOUT_MS);
  String status = hub.readStringUntil('\n');
  for (String line = hub.readStringUntil('\n'); line.length() > 1; line = hub.readStringUntil('\n')) {
  }
  hub.setTimeout(1000);
  if (status.indexOf(" 101 ") < 0) {
    status.trim();
    Serial.printf("[hub] cloud hub refused the clip: \"%s\" (401: the device token is unknown or revoked)\n", status.c_str());
    hub.stop();
    return false;
  }
  return true;
}
#endif

static void ensureConnected() {
  static uint32_t lastTry = 0;
  if (hub.connected() || millis() - lastTry < 2000) return;
  lastTry = millis();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[wifi] connecting to %s… (status %d)\n", WIFI_SSID, WiFi.status());
    return;
  }
#if CLOUD
  if (!connectCloud()) return;
#else
  bool ok = hubFound ? hub.connect(hubIp, hubPort, 2000) : hub.connect(HUB_HOST, HUB_PORT, 2000);
  if (!ok) {
    Serial.printf("[hub] %s:%d unreachable\n", hubFound ? hubIp.toString().c_str() : HUB_HOST, hubPort);
    // The Mac may have a new DHCP address: ask the LAN, then try whoever answered.
    if (!discoverHub() || !hub.connect(hubIp, hubPort, 2000)) return;
  }
#endif
  hub.setNoDelay(true);
  // Protocol v2 hello: the hub checks the major version and refuses old clips
  // with a plain-language "update the firmware" message. rssi/camera stay as
  // extras for the log; the hub reads proto, fw, codec and rate.
  char hello[160];
  int n = snprintf(hello, sizeof(hello),
                   "{\"proto\":\"2.0\",\"device\":\"lente-clip\",\"fw\":\"pilot-2\","
                   "\"codec\":\"pcm16\",\"rate\":16000,\"rssi\":%d,\"camera\":%s}",
                   WiFi.RSSI(), cameraOn ? "true" : "false");
  sendFrame('H', (const uint8_t *)hello, n);
#if CLOUD
  Serial.printf("[hub] connected to %s over wss (wifi %d dBm)\n", HUB_CLOUD_HOST, WiFi.RSSI());
#else
  Serial.printf("[hub] connected to %s:%d (wifi %d dBm)\n", hub.remoteIP().toString().c_str(), hubPort, WiFi.RSSI());
#endif
}

static void handleCommand(int cmd) {
  if (cmd == 'P') photoRequested = true;
  if (cmd == 'B') {
    blinkUntil = millis() + 900;
    motorUntil = millis() + MOTOR_PULSE_MS;
  }
  if (cmd == 'C' || cmd == 'c') {
    cameraWanted = cmd == 'C';
    setCamera(cameraWanted);
    Serial.printf("[cam] %s\n", cameraWanted ? "on" : "off (mic only)");
  }
  if (cmd == 'M' || cmd == 'm') {
    micOn = cmd == 'M';
    Serial.printf("[mic] %s\n", micOn ? "listening" : "paused");
  }
}

#if CLOUD
// Server frames are unmasked; the hub sends each command as a short binary message and answers
// our pings with pongs. Commands run after the lock is released (a photo takes it to send).
static void readCommands() {
  uint8_t cmds[16];
  size_t count = 0;
  xSemaphoreTake(sendLock, portMAX_DELAY);
  while (hub.connected() && hub.available() >= 2 && count < sizeof(cmds)) {
    uint8_t h[2];
    hub.readBytes(h, 2);
    uint8_t opcode = h[0] & 0x0f;
    uint64_t len = h[1] & 0x7f;
    uint8_t ext[8];
    if (len == 126 && hub.readBytes(ext, 2) == 2) {
      len = (ext[0] << 8) | ext[1];
    } else if (len == 127 && hub.readBytes(ext, 8) == 8) {
      len = 0;
      for (int i = 0; i < 8; i++) len = (len << 8) | ext[i];
    }
    uint8_t ping[125];
    size_t pingLen = 0;
    bool cut = false;
    for (uint64_t i = 0; i < len; i++) {
      uint8_t b;
      if (hub.readBytes(&b, 1) != 1) {
        cut = true;
        break;
      }
      if (opcode == 0x2 && count < sizeof(cmds)) cmds[count++] = b;
      if (opcode == 0x9 && pingLen < sizeof(ping)) ping[pingLen++] = b;
    }
    if (opcode == 0x9) wsWrite(0xA, ping, pingLen, nullptr, 0);
    if (cut || opcode == 0x8) {
      Serial.println(cut ? "[hub] message cut short; reconnecting" : "[hub] cloud hub closed the WebSocket");
      hub.stop();
    }
  }
  static uint32_t lastPing = 0;
  if (hub.connected() && millis() - lastPing > WS_PING_EVERY_MS) {
    lastPing = millis();
    wsWrite(0x9, nullptr, 0, nullptr, 0);
  }
  xSemaphoreGive(sendLock);
  for (size_t i = 0; i < count; i++) handleCommand(cmds[i]);
}
#else
static void readCommands() {
  while (hub.connected() && hub.available()) handleCommand(hub.read());
}
#endif

void setup() {
  Serial.begin(115200);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
  pinMode(MOTOR_PIN, OUTPUT);
  digitalWrite(MOTOR_PIN, LOW);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  sendLock = xSemaphoreCreateMutex();

  // The camera stays off until the hub asks for it: mic-only is the battery-friendly default.
  i2s.setPinsPdmRx(MIC_CLK_PIN, MIC_DATA_PIN);
  if (!i2s.begin(I2S_MODE_PDM_RX, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) Serial.println("[mic] init failed");

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // power save adds latency to every audio frame

  // The ESP32 only sees 2.4 GHz: report whether the configured network is visible at all.
  int found = WiFi.scanNetworks();
  bool visible = false;
  for (int i = 0; i < found; i++) {
    if (WiFi.SSID(i) == WIFI_SSID) {
      visible = true;
      Serial.printf("[wifi] %s visible: channel %d, %d dBm, auth %d\n", WIFI_SSID, WiFi.channel(i), WiFi.RSSI(i), WiFi.encryptionType(i));
    }
  }
  if (!visible) {
    Serial.printf("[wifi] %s not visible on 2.4 GHz (%d other networks)\n", WIFI_SSID, found);
    String wanted = String(WIFI_SSID);
    wanted.toLowerCase();
    for (int i = 0; i < found; i++) {
      String name = WiFi.SSID(i);
      name.toLowerCase();
      if (name.indexOf(wanted) >= 0) Serial.printf("[wifi] similar name: \"%s\" channel %d\n", WiFi.SSID(i).c_str(), WiFi.channel(i));
    }
  }
  WiFi.scanDelete();
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  xTaskCreatePinnedToCore(audioTask, "audio", 8192, nullptr, 2, nullptr, 1);
}

void loop() {
  ensureConnected();

  static bool lastButton = HIGH;
  static uint32_t lastPress = 0;
  bool button = digitalRead(BUTTON_PIN);
  if (button == LOW && lastButton == HIGH && millis() - lastPress > 500) {
    lastPress = millis();
    photoRequested = true;
  }
  lastButton = button;

  readCommands();

  if (photoRequested) {
    photoRequested = false;
    takePhoto();
  }

  // Three quick blinks for a cue; otherwise the LED stays dark to save battery and attention.
  bool blinking = millis() < blinkUntil && ((blinkUntil - millis()) / 150) % 2 == 0;
  digitalWrite(LED_PIN, blinking ? LOW : HIGH);
  digitalWrite(MOTOR_PIN, millis() < motorUntil ? HIGH : LOW);
  delay(10);
}
