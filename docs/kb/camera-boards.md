# Camera boards for the clip

Research note, 2026-10-29. The v1 clip is a Seeed XIAO ESP32-S3 Sense (21 x 17.8 mm, 21 x 17.8 x 15 mm with the Sense board) with an OV3660 on DVP and a PDM mic. It sends PCM audio and JPEG stills over TCP ([PROTOCOL.md](../PROTOCOL.md)) from a 60 x 22 x 31 mm pod on a 1S 3.7 V ~500 mAh LiPo (about 1.85 Wh). This note asks which boards could drive a better camera: more resolution, autofocus, better low light, wider FOV, maybe hardware video encoding.

Every spec and price below links to a source. **Est.** marks my own arithmetic from those sources, not a measurement. Lente's own latency and power numbers still come from `scripts/` runs.

**What matters for Lente.** The hub sends **stills** to Meta's vision model, so the `J` frame already covers the vision path. Sensor quality, autofocus and ISP give more than an H.264 encoder does. H.264 only matters for recorded video. It would also need a new frame type and a decoder on the hub, which the zero-dependency rule makes costly.

## Comparison

| Option | Best sensor (verified) | Interface | On-board encoder | Wi-Fi | Board size | Power while streaming |
|---|---|---|---|---|---|---|
| **XIAO ESP32-S3 Sense + OV5640 AF** | OV5640, 5 MP (2592x1944), autofocus [1][2] | DVP | None on S3 (sensor JPEG). 1600x1200 JPEG at 25 fps measured by Espressif [4] | On chip, 2.4 GHz | 21 x 17.8 x 15 mm [1] | Seeed webcam app: avg ~155 mA, peak ~366 mA at 3.8 V [1] |
| **ESP32-P4 + C6**: M5Stack Stamp-P4 + AddOn C6 | Official drivers: SC2336 1080p30, OV5645 5 MP at 15 fps [4], OV5647 [6]. IMX708 (Camera Module 3, AF) via community driver, 1080p up to 56 fps [7] | MIPI CSI 2-lane, 1.5 Gbps/lane [5] | HW JPEG 1080p@40 fps. HW H.264 baseline 1080p30 [5][11]. ISP max 1920x1080 [5] | Separate C6 module over SDIO. Community test: ~30–40 Mbps [12] | 29.8 x 22 x 4.3 mm, 2.7 g, plus C6 27 x 18 x 4 mm [8][9] | P4 alone: 110–150 mA at 3.3 V, 400 MHz, peripherals on [5]. Bare board 5 V @ 31 mA [8]. **Est.** ~1 W with C6 and sensor |
| ESP32-P4 + C6: DFRobot FireBeetle 2 ESP32-P4 | Same chip. Pi-compatible CSI [10] | MIPI CSI 2-lane | Same as above | C6 on board [10] | 25.4 x 60 mm [10] | Not published |
| **Raspberry Pi Zero 2 W + Camera Module 3** | IMX708 12 MP, PDAF autofocus, HDR, 75° or 120° wide, 1080p50 [14] | MIPI CSI-2 | HW H.264 1080p30 [13] | On board, 2.4 GHz [13] | 65 x 30 mm, plus camera 25 x 24 x 11.5 mm [13][14] | Idle ~120 mA at 5 V. Wi-Fi iperf adds ~187 mA avg [15]. **Est.** ≥1.5 W with camera |
| Radxa Zero 3W | Pi Camera v1.3/v2 confirmed. Newer modules unclear [19] | MIPI CSI | H.264/H.265 1080p [19] | Wi-Fi 6 [19] | 65 x 30 mm [19] | Not found |
| Luckfox Pico Ultra W / Pico Zero (RV1106) | ISP 5 MP HDR/WDR [16]. Pico Zero takes up to 8 MP at 15 fps [17]. SC3336 3 MP, 98° default module [18] | MIPI CSI 2-lane (Pico Zero 2x2) | H.264/H.265 3072x1728@30 [16] | Wi-Fi 6 on these two [16][17] | Ultra 50 x 50 mm [16]. Core1106 30 x 30 mm, needs a carrier [20] | Not found |
| Luckfox Pico Mini (RV1103) | SC3336 3 MP [21] | MIPI CSI 2-lane | Not stated [21] | **None** [21] | 28 x 21 mm [21] | Not found |
| Sipeed MaixCAM / MaixCAM-Pro | GC4653 / OS04A10 4 MP [22][23] | MIPI CSI 4-lane | H.264/H.265 2K@30 [22] | Wi-Fi 6 [22] | Pro: 67 x 51 x 12 mm, AXP2101 PMIC, battery option [23] | Not found |
| Sipeed MaixCAM2 (AX630C) | Up to 8 MP (4K) at 30 fps [24] | MIPI CSI 4-lane | H.264/H.265 4K30 [24] | Wi-Fi 6 [24] | 66.5 x 50 x 21.2 mm [24] | Not found |
| Milk-V Duo S (SG2000) | 5 MP sensors. GC2083, OV5647 supported [25][26] | 2x MIPI CSI 2-lane | H.264/H.265 [26] | Optional Wi-Fi 6 [25] | 43 x 43 mm [25] | Not found |
| Arduino Nicla Vision | GC2145 2 MP [27] | — | None | On board [27] | 22.86 x 22.86 mm, 1S LiPo connector [27] | Not found |
| OpenMV N6 | PAG7936 1 MP global shutter, 1280x800 at 120 fps [28] | — | — | 2.4 GHz [28] | 45 x 35 mm, 21 g [28] | ~0.75 W full load [28] |
| Grove Vision AI V2 / XIAO Vision AI Camera | OV5647 5 MP [29][30] | MIPI CSI | — | Only through a XIAO host | 49 x 32 x 31 mm camera [30] | Not found |

| Option | 1S LiPo? | Boot | Price (USD) | Colombia / shipping | Firmware work vs. today |
|---|---|---|---|---|---|
| XIAO + OV5640 | Yes, BAT pad, on-board charger [1] | ~instant (MCU). OV5640 init 240 ms [4] | Camera $11.99, Sense board $13.90 [2][3] | Not found in Bogotá stores. Seeed DHL: 3–5 days after dispatch [31] | **Low**: same FPC and driver. Seeed's example works with both sensors [1]. Autofocus needs an extra step |
| Stamp-P4 + C6 | No: 5 V input with an on-board DC-DC [8]. Needs a boost or 3.3 V supply design | ~instant (MCU) | $12.95 + $7.00 [9]. Camera Module 3 from $25 [14] | Board not found in Bogotá stores. Camera Module 3 in stock at Sigma [34] | **High**: ESP-IDF port, esp_video and ISP tuning, esp_hosted Wi-Fi, external mic. The protocol and `J` frames stay the same |
| FireBeetle 2 P4 | 5 V via USB-C/VCC [10] | ~instant | $16.50 board, $18.50 kit [10] | DigiKey lists it [32] | Same as above, minus the C6 wiring |
| Pi Zero 2 W + CM3 | No: 5 V. Needs a boost | Stock OS ~12 s. Buildroot <3.5 s (measured with the HQ camera) [33] | $15 + from $25 [13][14] | CM3: Sigma, COP 149,940, in stock [34]. Zero 2 W: Didácticas COP 86,394, stock unconfirmed [35]; Sigma COP 98,175, sold out [36] | **Rewrite**: Linux service on libcamera, I2S or USB mic, own OS image |
| Luckfox Pico Mini | 5 V USB-C [21] | Not found | $10–14 + SC3336 <$10 [21] | Didácticas COP 39,061, stock unconfirmed [37] | **Rewrite** (Busybox Linux, Rockchip media SDK). Still needs a radio |

## Recommendations

**(a) Drop-in, same XIAO form factor: the Seeed OV5640 autofocus camera ($11.99).** It plugs into the Sense board's camera connector, and Seeed now ships new Sense boards with it by default because the OV3660 is out of stock [1]. You get 5 MP over 3 MP and autofocus, which helps with documents and whiteboards at different distances. You do not get a better ISP, a wider FOV or hardware video: the S3 path stays DVP plus sensor-side JPEG. Seeed ships heat sinks with the module [2], so plan an air path in the pod. Battery life stays where it is: at ~0.6 W from the Seeed figures, the 1.85 Wh cell lasts about 3 h (**est.**). This is the only option that fits before the Nov 4 deadline.

**(b) Best camera that still fits the pod: ESP32-P4 on the M5Stack Stamp-P4 plus the C6 add-on.** Both modules are under 22 mm wide and about 4 mm thick [9], so they fit the current 60 x 22 mm footprint. The board weighs 2.7 g [8]. The P4 adds real MIPI CSI, an ISP, hardware JPEG at 1080p@40 fps and H.264 at 1080p30 [5].

- **Camera:** start with an officially supported 2 MP SC2336 (1080p30 benchmarked by Espressif [4]). The stretch goal is Camera Module 3 (IMX708, autofocus, 120° Wide). Its driver is a community component tested on one board, and it has documented caveats: no downscaling, and modes are fixed before streaming starts [7]. One CNX write-up still says the P4 only supports the OV5647 among Pi cameras [38], so treat IMX708 as unproven.
- **Radio:** the C6 link measured ~30–40 Mbps [12], plenty for stills and audio.
- **Trade-offs:** about 1 W (**est.**) halves battery life to ~1.5–2 h. The modules need a 5 V input or a custom 3.3 V supply [8]. The Stamp has no mic. It is a firmware port, not a swap.

**(c) Max quality: Raspberry Pi Zero 2 W + Camera Module 3 Wide.** You get a 12 MP stacked BSI sensor with phase-detect autofocus, HDR and a 120° FOV [14], plus H.264 1080p30 in hardware [13]. Both parts are listed in Bogotá: the standard Camera Module 3 at Sigma, in stock [34] (the Wide was not found locally), and the board at Didácticas, stock unconfirmed [35].

- **Size:** the 65 x 30 mm board [13] needs a longer, wider pod.
- **Power:** it needs a 5 V boost from the cell. At ≥1.5 W (**est.** from [15], before camera and boost losses) the 500 mAh cell lasts under 1 h, so plan for ~1500 mAh or more.
- **Boot:** ~12 s on stock Raspberry Pi OS, 3.5 s only with a stripped Buildroot image [33].
- **Firmware:** a full rewrite on Linux.
- **Heat:** more heat in a closed pod at the temple.

The Radxa Zero 3W has the same footprint with Wi-Fi 6, but its support for Camera Module 3 is unconfirmed [19].

**Not recommended for the pod.** MaixCAM, MaixCAM2, Luckfox Ultra W/Zero and Milk-V Duo S have excellent ISPs and encoders but are 43–67 mm wide. The Luckfox Core1106 (30 x 30 mm, Wi-Fi 6 option, 5 MP HDR ISP [20]) is the best base for a future custom PCB. Grove Vision AI V2 only passes inference results to its host, not frames [29]. Nicla Vision (2 MP) and OpenMV N6 (1 MP, $180) are not upgrades for stills. Allwinner V3s boards were not evaluated.

## Sources

1. Seeed wiki, XIAO ESP32-S3 getting started (dimensions, OV5640 default, power table): https://wiki.seeedstudio.com/xiao_esp32s3_getting_started
2. Seeed, OV5640 Camera for XIAO ESP32S3 Sense ($11.99): https://www.seeedstudio.com/OV5640-Camera-for-XIAO-ESP32S3-Sense-With-Heat-Sink-p-5739.html
3. Seeed, XIAO ESP32S3 Sense ($13.90): https://www.seeedstudio.com/XIAO-ESP32S3-Sense-p-5639.html
4. Espressif, DVP and MIPI-CSI camera solution (frame-rate and init tables): https://docs.espressif.com/projects/esp-techpedia/en/latest/esp-friends/solution-introduction/camera/dvp-mipi-csi-camera-solution.html
5. Espressif, ESP32-P4 datasheet (current table, MIPI CSI, ISP, JPEG, H.264): https://documentation.espressif.com/esp32-p4_datasheet_en.html
6. Espressif, esp_cam_sensor supported sensors: https://github.com/espressif/esp-video-components/tree/master/esp_cam_sensor
7. esp_cam_sensor_imx 0.4.0 (community IMX708/IMX219 driver for ESP32-P4): https://components.espressif.com/components/mushbraindave/esp_cam_sensor_imx/versions/0.4.0/readme
8. M5Stack docs, Stamp-P4: https://docs.m5stack.com/en/core/Stamp-P4
9. CNX Software, Stamp-P4 and Stamp-AddOn C6 (sizes, prices): https://www.cnx-software.com/?p=167878
10. DFRobot, FireBeetle 2 ESP32-P4 (DFR1237): https://www.dfrobot.com/product-2950.html
11. Espressif, ESP-H264 component: https://docs.espressif.com/projects/esp-techpedia/en/latest/esp-friends/solution-introduction/multimedia/component-description/esp-h264.html
12. r4d10n, ESP32-P4 + C6 Wi-Fi throughput test: https://github.com/r4d10n/esp32p4-c6-wifi-test and https://github.com/espressif/esp-hosted-mcu/issues/112
13. Raspberry Pi, Zero 2 W: https://www.raspberrypi.com/products/raspberry-pi-zero-2-w/
14. Raspberry Pi, Camera Module 3: https://www.raspberrypi.com/products/camera-module-3/
15. CNX Software, Raspberry Pi Zero 2 W power consumption: https://www.cnx-software.com/2021/12/09/raspberry-pi-zero-2-w-power-consumption/
16. CNX Software, Luckfox Pico Ultra: https://www.cnx-software.com/2024/06/21/luckfox-pico-ultra-micro-development-board-features-mipi-csi-wifi-6-ethernet-poe-gpio-headers/
17. Waveshare, Luckfox Pico Zero: https://www.waveshare.com/luckfox-pico-zero.htm
18. CNX Software, Luckfox Pico Pro/Max (RV1106 encoder, SC3336): https://www.cnx-software.com/2024/02/29/luckfox-pico-pro-pico-max-rockchip-rv1106-boards-100m-ethernet-5mp-camera/
19. CNX Software, Radxa Zero 3W: https://www.cnx-software.com/2023/12/08/radxa-zero-3w-sbc-rockchip-rk3566-8gb-ram-wifi6-raspberry-pi-zero-2-w-form-factor/
20. Waveshare, Luckfox Core1106: https://www.waveshare.com/core1106.htm
21. CNX Software, Luckfox Pico Mini: https://www.cnx-software.com/2024/08/16/luckfox-pico-mini-tiny-arm-linux-camera-board-rockchip-rv1103-64mb-ram/
22. Sipeed wiki, MaixCAM: https://wiki.sipeed.com/hardware/en/maixcam/maixcam.html
23. Sipeed wiki, MaixCAM-Pro: https://wiki.sipeed.com/hardware/en/maixcam/maixcam_pro.html
24. Sipeed wiki, MaixCAM2: https://en.wiki.sipeed.com/hardware/en/maixcam/maixcam2.html
25. CNX Software, Milk-V Duo S: https://www.cnx-software.com/2024/03/25/duo-s-risc-v-arm-sbc-features-sophgo-sg2000-soc-ethernet-wifi-6-and-bluetooth-5-connectivity/
26. Milk-V docs, Duo S: https://milkv.io/docs/duo/getting-started/duos
27. Arduino docs, Nicla Vision: https://docs.arduino.cc/hardware/nicla-vision/ and datasheet https://docs.arduino.cc/resources/datasheets/ABX00051-datasheet.pdf
28. Derek Molloy, OpenMV N6 review: https://derekmolloy.ie/the-openmv-n6-a-micropython-camera-with-a-real-npu/
29. Seeed wiki, Grove Vision AI V2: https://wiki.seeedstudio.com/grove_vision_ai_v2/
30. CNX Software, XIAO Vision AI Camera: https://www.cnx-software.com/?p=151120
31. Seeed support, shipping methods: https://support.seeedstudio.com/knowledgebase/articles/1883842-how-to-select-shipping-method
32. DigiKey, DFRobot DFR1237: https://www.digikey.com/es/products/detail/dfrobot/DFR1237/28531124
33. Kittenlabs, Extreme Pi boot optimization: https://kittenlabs.de/blog/2024/09/01/extreme-pi-boot-optimization/
34. Sigma Electrónica, SC0872 Camera Module 3: https://www.sigmaelectronica.net/producto/sc0872/
35. Didácticas Electrónicas, Raspberry Pi Zero 2 W: https://www.didacticaselectronicas.com/shop/rpiz-2w-raspberry-pi-zero-2-w-20157
36. Sigma Electrónica, Raspberry Pi Zero W page (Zero 2 W in related products): https://www.sigmaelectronica.net/producto/rpi-zero-w/
37. Didácticas Electrónicas, Luckfox Pico Mini: https://www.didacticaselectronicas.com/shop/ws-25722-placa-de-desarrollo-micro-linux-luckfox-pico-mini-rv1103-39549
38. CNX Software, ESP32P4C5 Core Board: https://www.cnx-software.com/2026/05/04/esp32-p4-esp32-c5-board-features-raspberry-pi-compatible-mipi-connectors-for-official-displays-and-camera-modules/
