package app.lente.capture

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** The phone as the device, as the screens see it. Shared in-process between the service and the UI. */
object Capture {
    sealed interface State {
        data object Off : State
        data object Starting : State
        /** `sending` follows the hub's listen and pause commands. */
        data class On(val sending: Boolean) : State
        /** Stopped by something other than the wearer; `resumable` offers "Reanudar". */
        data class Stopped(val why: String, val resumable: Boolean) : State
    }

    private val _state = MutableStateFlow<State>(State.Off)
    val state: StateFlow<State> = _state
    internal fun set(s: State) { _state.value = s }

    /** Until when the microphone stays muted because Lente is speaking (wall clock ms). */
    @Volatile var mutedUntil = 0L
    @Volatile var speaking = false
    val muted get() = speaking || System.currentTimeMillis() < mutedUntil
}
