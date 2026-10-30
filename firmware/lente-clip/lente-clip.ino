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
// Build: arduino-cli compile -b esp32:esp32:XIAO_ESP32S3:PSRAM=opi --upload -p <port> firmware/lente-clip

#include "esp_camera.h"
#include <ESP_I2S.h>
#include <WiFi.h>
#include <string.h>
#include "secrets.h"

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

static WiFiClient hub;
static SemaphoreHandle_t sendLock;
static I2SClass i2s;
static volatile bool photoRequested = false;
static volatile bool micOn = true;    // "M" / "m" from the hub: pause listening without disconnecting
static bool cameraOn = false;         // sensor actually running
static bool cameraWanted = false;     // "C" / "c" from the hub; off saves battery in mic-only mode
static uint32_t blinkUntil = 0;
static uint32_t motorUntil = 0;

static bool sendFrame(char type, const uint8_t *data, size_t len) {
  if (!hub.connected()) return false;
  uint8_t header[5] = {(uint8_t)type, (uint8_t)len, (uint8_t)(len >> 8), (uint8_t)(len >> 16), (uint8_t)(len >> 24)};
  xSemaphoreTake(sendLock, portMAX_DELAY);
  bool ok = hub.write(header, 5) == 5 && hub.write(data, len) == len;
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

static void ensureConnected() {
  static uint32_t lastTry = 0;
  if (hub.connected() || millis() - lastTry < 2000) return;
  lastTry = millis();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.printf("[wifi] connecting to %s… (status %d)\n", WIFI_SSID, WiFi.status());
    return;
  }
  if (!hub.connect(HUB_HOST, HUB_PORT, 2000)) {
    Serial.printf("[hub] %s:%d unreachable\n", HUB_HOST, HUB_PORT);
    return;
  }
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
  Serial.printf("[hub] connected to %s:%d (wifi %d dBm)\n", HUB_HOST, HUB_PORT, WiFi.RSSI());
}

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

  while (hub.connected() && hub.available()) {
    int cmd = hub.read();
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
