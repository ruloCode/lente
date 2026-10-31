package app.lente.core

import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Clip protocol v2 uplink frames, the bytes the clip sends over TCP and the phone over the hub's
 * `/device` WebSocket: 1 byte type, 4 bytes little-endian length, payload (docs/PROTOCOL.md).
 * Checked against test/fixtures/frames.json, the golden frames the hub and the firmware share.
 */
object ClipFrames {
    const val PROTOCOL = "2.0"
    const val SAMPLE_RATE = 16_000
    /** 80 ms at 16 kHz mono: the clip's audio frame. */
    const val FRAME_SAMPLES = 1280
    const val FRAME_MS = 80
    /** The `device` a phone declares in its hello; the hub then shows it as the phone. */
    const val PHONE_DEVICE = "lente-phone"
    private const val HEADER_BYTES = 5
    private const val AUDIO_HEADER_BYTES = 8

    fun frame(type: Char, payload: ByteArray): ByteArray {
        val out = ByteBuffer.allocate(HEADER_BYTES + payload.size).order(ByteOrder.LITTLE_ENDIAN)
        out.put(type.code.toByte()).putInt(payload.size).put(payload)
        return out.array()
    }

    /** The v2 hello; field order matches the hub's `encodeHello`, which the golden fixtures pin. */
    fun hello(fw: String, device: String = PHONE_DEVICE, rssi: Int = 0, camera: Boolean = false): ByteArray {
        val json = """{"proto":"$PROTOCOL","device":"${jsonText(device)}","fw":"${jsonText(fw)}","codec":"pcm16","rate":$SAMPLE_RATE,"rssi":$rssi,"camera":$camera}"""
        return frame('H', json.toByteArray(Charsets.UTF_8))
    }

    /** One audio frame: u32 sequence, u32 capture ms, then PCM16 little-endian samples. */
    fun audio(seq: Long, timeMs: Long, samples: ShortArray, count: Int = samples.size): ByteArray {
        val payload = ByteBuffer.allocate(AUDIO_HEADER_BYTES + count * 2).order(ByteOrder.LITTLE_ENDIAN)
        payload.putInt((seq and 0xFFFFFFFFL).toInt()).putInt((timeMs and 0xFFFFFFFFL).toInt())
        for (i in 0 until count) payload.putShort(samples[i])
        return frame('A', payload.array())
    }

    fun jpeg(bytes: ByteArray): ByteArray = frame('J', bytes)

    private fun jsonText(s: String) = s.replace("\\", "\\\\").replace("\"", "\\\"")
}

/** Hub → device single-byte commands. */
enum class HubCommand(val byte: Char) {
    Blink('B'), Photo('P'), CameraOn('C'), CameraOff('c'), Listen('M'), Pause('m'), Takeover('T');

    companion object {
        fun of(b: Byte): HubCommand? = entries.firstOrNull { it.byte.code.toByte() == b }
    }
}
