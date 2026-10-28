// Lente clip self-test for the Seeed XIAO ESP32-S3 Sense.
// Checks PSRAM, camera (and dumps one JPEG as base64), PDM microphone,
// microSD and Wi-Fi reception. Send any line over serial to run it again,
// or "r" to record 5 s of microphone audio.
//
// Build: arduino-cli compile -b esp32:esp32:XIAO_ESP32S3:PSRAM=opi firmware/selftest

#include "esp_camera.h"
#include "mbedtls/base64.h"
#include <ESP_I2S.h>
#include <SD.h>
#include <SPI.h>
#include <WiFi.h>
#include <string.h>

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
#define SD_CS_PIN 21

static bool cameraReady = false;

static const char *sensorName(uint16_t pid) {
  switch (pid) {
    case OV2640_PID: return "OV2640";
    case OV3660_PID: return "OV3660";
    case OV5640_PID: return "OV5640";
    default: return "unknown";
  }
}

static void testMemory() {
  Serial.printf("[mem] psram=%u bytes free=%u | flash=%u bytes | cpu=%u MHz\n",
                ESP.getPsramSize(), ESP.getFreePsram(), ESP.getFlashChipSize(), getCpuFrequencyMhz());
}

static void testCamera() {
  if (!cameraReady) {
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
    c.frame_size = FRAMESIZE_VGA;
    c.jpeg_quality = 12;
    c.fb_count = 2;
    c.fb_location = CAMERA_FB_IN_PSRAM;
    c.grab_mode = CAMERA_GRAB_LATEST;
    esp_err_t err = esp_camera_init(&c);
    if (err != ESP_OK) {
      Serial.printf("[cam] FAIL init error 0x%x (check the camera ribbon and PSRAM=opi)\n", err);
      return;
    }
    cameraReady = true;
  }
  sensor_t *s = esp_camera_sensor_get();
  Serial.printf("[cam] sensor=%s pid=0x%04x\n", sensorName(s->id.PID), s->id.PID);

  // Let auto exposure settle, then time a few grabs.
  for (int i = 0; i < 5; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (fb) esp_camera_fb_return(fb);
  }
  uint32_t t0 = millis();
  size_t bytes = 0;
  const int frames = 10;
  for (int i = 0; i < frames; i++) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) { Serial.println("[cam] FAIL no frame"); return; }
    bytes += fb->len;
    esp_camera_fb_return(fb);
  }
  uint32_t dt = millis() - t0;
  Serial.printf("[cam] ok %d frames, avg %u bytes, %.1f fps\n", frames, (unsigned)(bytes / frames), frames * 1000.0 / dt);

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) return;
  size_t outLen = 0;
  mbedtls_base64_encode(nullptr, 0, &outLen, fb->buf, fb->len);
  unsigned char *out = (unsigned char *)ps_malloc(outLen + 1);
  if (out && mbedtls_base64_encode(out, outLen + 1, &outLen, fb->buf, fb->len) == 0) {
    Serial.printf("[cam] jpeg %ux%u %u bytes\n", fb->width, fb->height, (unsigned)fb->len);
    Serial.println("JPEG_BEGIN");
    for (size_t i = 0; i < outLen; i += 256) {
      Serial.write(out + i, min((size_t)256, outLen - i));
      Serial.println();
    }
    Serial.println("JPEG_END");
  }
  free(out);
  esp_camera_fb_return(fb);
}

static void testMic() {
  I2SClass i2s;
  i2s.setPinsPdmRx(MIC_CLK_PIN, MIC_DATA_PIN);
  if (!i2s.begin(I2S_MODE_PDM_RX, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    Serial.println("[mic] FAIL i2s begin");
    return;
  }
  static int16_t buf[4000];  // 250 ms at 16 kHz
  i2s.readBytes((char *)buf, sizeof(buf));  // discard start-up samples
  Serial.println("[mic] listening 6 s: talk or clap now");
  int32_t loudest = 0;
  bool allSame = true;
  for (int w = 0; w < 24; w++) {
    size_t n = i2s.readBytes((char *)buf, sizeof(buf)) / sizeof(int16_t);
    // PDM output carries a DC offset; measure sound around the window's mean.
    double mean = 0;
    for (size_t i = 0; i < n; i++) mean += buf[i];
    mean = n ? mean / n : 0;
    double sum = 0;
    int32_t peak = 0;
    for (size_t i = 0; i < n; i++) {
      int32_t v = (int32_t)(buf[i] - mean);
      sum += (double)v * v;
      if (abs(v) > peak) peak = abs(v);
      if (i && buf[i] != buf[0]) allSame = false;
    }
    int rms = n ? (int)sqrt(sum / n) : 0;
    if (peak > loudest) loudest = peak;
    Serial.printf("[mic] %4.2fs rms=%5d peak=%5d ", w * 0.25, rms, peak);
    for (int b = 0; b < min(40, rms / 25); b++) Serial.print('#');
    Serial.println();
  }
  i2s.end();
  Serial.printf("[mic] %s loudest peak=%d\n", allSame ? "FAIL flat signal" : "ok", loudest);
}

// Records a few seconds of raw 16 kHz mono PCM and dumps it as base64 for the host to save as WAV.
static void recordClip(int seconds) {
  I2SClass i2s;
  i2s.setPinsPdmRx(MIC_CLK_PIN, MIC_DATA_PIN);
  if (!i2s.begin(I2S_MODE_PDM_RX, 16000, I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_MONO)) {
    Serial.println("[rec] FAIL i2s begin");
    return;
  }
  size_t bytes = (size_t)seconds * 16000 * sizeof(int16_t);
  uint8_t *pcm = (uint8_t *)ps_malloc(bytes);
  static int16_t warmup[1600];
  i2s.readBytes((char *)warmup, sizeof(warmup));
  Serial.printf("[rec] recording %d s: talk now\n", seconds);
  size_t got = 0;
  while (got < bytes) got += i2s.readBytes((char *)pcm + got, min((size_t)4096, bytes - got));
  i2s.end();
  size_t outLen = 0;
  mbedtls_base64_encode(nullptr, 0, &outLen, pcm, bytes);
  unsigned char *out = (unsigned char *)ps_malloc(outLen + 1);
  if (out && mbedtls_base64_encode(out, outLen + 1, &outLen, pcm, bytes) == 0) {
    Serial.println("PCM_BEGIN");
    for (size_t i = 0; i < outLen; i += 256) {
      Serial.write(out + i, min((size_t)256, outLen - i));
      Serial.println();
    }
    Serial.println("PCM_END");
  }
  free(out);
  free(pcm);
  Serial.println("=== done ===");
}

static void testSd() {
  if (!SD.begin(SD_CS_PIN)) {
    Serial.println("[sd] no card (optional)");
    return;
  }
  Serial.printf("[sd] ok card %llu MB\n", SD.cardSize() / (1024 * 1024));
  SD.end();
}

static void testWifi() {
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  int n = WiFi.scanNetworks();
  int best = -127;
  for (int i = 0; i < n; i++) best = max(best, (int)WiFi.RSSI(i));
  const char *verdict = n == 0 ? "FAIL nothing heard (antenna connected?)"
                      : best > -60 ? "ok strong"
                      : best > -75 ? "ok usable"
                      : "weak (antenna connected?)";
  Serial.printf("[wifi] networks=%d strongest=%d dBm %s\n", n, best, verdict);
  WiFi.scanDelete();
  WiFi.mode(WIFI_OFF);
}

// Protocol-v2 golden frames shared with test/fixtures/frames.json (fixtures.h is generated
// from it by `pnpm gen:fixtures`): the self-test encodes the frames the way the clip
// firmware does and compares every byte, so a change that alters the wire format fails
// here as well as in the hub tests.
#include "fixtures.h"

static size_t encodeFrame(char type, const uint8_t *data, size_t len, uint8_t *out) {
  out[0] = (uint8_t)type;
  out[1] = (uint8_t)len;
  out[2] = (uint8_t)(len >> 8);
  out[3] = (uint8_t)(len >> 16);
  out[4] = (uint8_t)(len >> 24);
  memcpy(out + 5, data, len);
  return 5 + len;
}

// Same hello text as ensureConnected() in firmware/lente-clip, with the fixture's rssi and camera.
static size_t encodeHello(uint8_t *out, size_t cap) {
  char hello[160];
  int n = snprintf(hello, sizeof(hello),
                   "{\"proto\":\"2.0\",\"device\":\"lente-clip\",\"fw\":\"pilot-2\","
                   "\"codec\":\"pcm16\",\"rate\":16000,\"rssi\":%d,\"camera\":%s}",
                   -55, "false");
  if (n < 0 || (size_t)n + 5 > cap) return 0;
  return encodeFrame('H', (const uint8_t *)hello, n, out);
}

// Same layout as audioTask() in firmware/lente-clip: u32 sequence, u32 capture ms, PCM16.
static size_t encodeAudio(uint32_t seq, uint32_t ms, const int16_t *samples, size_t count, uint8_t *out) {
  uint8_t payload[8 + 2 * 8];
  memcpy(payload, &seq, 4);
  memcpy(payload + 4, &ms, 4);
  memcpy(payload + 8, samples, 2 * count);
  return encodeFrame('A', payload, 8 + 2 * count, out);
}

static bool frameMatches(const char *name, const uint8_t *got, size_t gotLen, const uint8_t *want, size_t wantLen) {
  bool ok = gotLen == wantLen && memcmp(got, want, wantLen) == 0;
  if (!ok) Serial.printf("[frames] FAIL %s: encoded %u bytes, fixture has %u\n", name, (unsigned)gotLen, (unsigned)wantLen);
  return ok;
}

static void testFrames() {
  uint8_t wire[5 + 160];
  int failures = 0;
  size_t n = encodeHello(wire, sizeof(wire));
  failures += !frameMatches("hello-v2", wire, n, FIXTURE_HELLO_V2, sizeof(FIXTURE_HELLO_V2));
  n = encodeAudio(FIXTURE_AUDIO_SEQ7_SEQ, FIXTURE_AUDIO_SEQ7_MS, FIXTURE_AUDIO_SEQ7_SAMPLES, 8, wire);
  failures += !frameMatches("audio-seq7", wire, n, FIXTURE_AUDIO_SEQ7, sizeof(FIXTURE_AUDIO_SEQ7));
  n = encodeAudio(FIXTURE_AUDIO_SEQ8_SEQ, FIXTURE_AUDIO_SEQ8_MS, FIXTURE_AUDIO_SEQ8_SAMPLES, 8, wire);
  failures += !frameMatches("audio-seq8", wire, n, FIXTURE_AUDIO_SEQ8, sizeof(FIXTURE_AUDIO_SEQ8));
  Serial.printf("[frames] %s\n", failures ? "FAIL fixture bytes differ" : "ok hello v2 + audio headers match the fixtures");
}

static void runAll() {
  Serial.println("=== Lente self-test ===");
  testMemory();
  testWifi();
  testSd();
  testFrames();
  testMic();
  testCamera();
  Serial.println("=== done ===");
}

void setup() {
  Serial.begin(115200);
  delay(3000);
  runAll();
}

void loop() {
  if (Serial.available()) {
    char cmd = Serial.read();
    while (Serial.available()) Serial.read();
    if (cmd == 'r') recordClip(5);  // "r": record 5 s of audio
    else runAll();                  // anything else: full self-test
  }
  delay(50);
}
