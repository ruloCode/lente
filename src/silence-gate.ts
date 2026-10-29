// The silence gate: while listening, audio goes to transcription only around speech, since
// transcription is billed per second sent. A frame is speech when the clip's level clears both a
// floor (MIN) and a multiple of the room's noise floor (the quietest frame of the last few
// seconds, so a fan or an air conditioner doesn't hold the gate open). The gate keeps a short
// pre-roll of the frames before the level rose and sends it first, keeps sending for a hangover
// after the last speech frame (the service needs trailing silence to end a turn), and sends
// nothing in silence. The noise floor is learned only while the gate is closed. The service closes a session that gets no audio; the next speech reopens it.
// Pure: frames are counted, not timed, because the hub feeds one every FRAME_MS on a steady clock.

export interface GateConfig {
  frameMs: number;
  /** Lowest level (RMS of the conditioned PCM16 frame) that can count as speech. */
  minSpeechRms: number;
  /** Speech is at least this many times the room's noise floor. */
  floorRatio: number;
  /** How far back the noise floor looks. */
  floorWindowMs: number;
  /** Audio kept before the level rose, sent first when the gate opens. */
  preRollMs: number;
  /** Audio still sent after the last speech frame. */
  hangoverMs: number;
}

export const GATE_DEFAULTS: GateConfig = {
  frameMs: 80,
  minSpeechRms: 300,
  floorRatio: 3,
  floorWindowMs: 10_000,
  preRollMs: 480,
  hangoverMs: 1600,
};

export interface GateStep<T> {
  /** Frames to send now, oldest first: the pre-roll comes before the frame that opened the gate. */
  send: T[];
  /** The session was closed (or never opened): open one before sending. */
  reopen: boolean;
}

export class SilenceGate<T> {
  private config: GateConfig;
  private preRoll: T[] = [];
  private levels: number[] = [];
  private isOpen = false;
  private quietFrames = 0;
  /** No session yet, or the service closed it in silence. */
  private sessionClosed = true;

  constructor(config: Partial<GateConfig> = {}) {
    this.config = { ...GATE_DEFAULTS, ...config };
  }

  get open(): boolean {
    return this.isOpen;
  }

  /** The level a frame needs to count as speech right now. */
  threshold(): number {
    const floor = this.levels.length ? Math.min(...this.levels) : 0;
    return Math.max(this.config.minSpeechRms, floor * this.config.floorRatio);
  }

  /** One frame and its level, in order, once per frame time. */
  push(frame: T, level: number): GateStep<T> {
    const speech = level >= this.threshold();
    // Only a closed gate learns the floor: while open, the gaps between words and a loud noise
    // that hands over to speech would lift the threshold above the voice and cut the sentence.
    if (!this.isOpen) this.noteLevel(level);
    if (!this.isOpen) {
      if (!speech) {
        this.keep(frame);
        return { send: [], reopen: false };
      }
      this.isOpen = true;
      this.quietFrames = 0;
      const send = [...this.preRoll.splice(0), frame];
      const reopen = this.sessionClosed;
      this.sessionClosed = false;
      return { send, reopen };
    }
    this.quietFrames = speech ? 0 : this.quietFrames + 1;
    if (this.quietFrames * this.config.frameMs > this.config.hangoverMs) {
      this.isOpen = false;
      this.keep(frame);
      return { send: [], reopen: false };
    }
    return { send: [frame], reopen: false };
  }

  /** The service closed the session: the next speech opens a new one, pre-roll first. */
  closed(): void {
    this.sessionClosed = true;
  }

  private keep(frame: T): void {
    this.preRoll.push(frame);
    const max = Math.round(this.config.preRollMs / this.config.frameMs);
    if (this.preRoll.length > max) this.preRoll.splice(0, this.preRoll.length - max);
  }

  private noteLevel(level: number): void {
    this.levels.push(level);
    const max = Math.round(this.config.floorWindowMs / this.config.frameMs);
    if (this.levels.length > max) this.levels.shift();
  }
}
