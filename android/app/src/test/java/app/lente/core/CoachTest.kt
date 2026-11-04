package app.lente.core

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** add-language-coach 2.2: the coach's wire as the phone reads it (design decision 13) and the per-language voice choice. Synthetic phrases. */
class CoachTest {
    private fun run(start: VoiceView, vararg events: String): Pair<VoiceView, List<VoiceEffect>> {
        var view = start
        val effects = mutableListOf<VoiceEffect>()
        for (e in events) {
            val (next, fx) = VoiceEvents.reduce(view, e)
            view = next
            effects += fx
        }
        return view to effects
    }

    @Test fun theStartNamesTheCoachItsLanguageAndTheTutor() {
        val m = JSONObject(Coach.start(Coach.PT))
        assertEquals("start", m.getString("type"))
        assertEquals("coach", m.getString("persona"))
        assertEquals("pt", m.getString("lang"))
        assertEquals("tutor", m.getString("mode"))
        assertEquals(false, m.getBoolean("intro"))
        assertEquals("""{"type":"look"}""", Coach.look())
        assertEquals("Idiomas · Portugués", Coach.title(Coach.PT))
    }

    @Test fun eachReplySentenceCarriesItsLanguageAndAnUntaggedOneIsSpanish() {
        val (_, fx) = run(
            VoiceView(lang = "pt"),
            """{"type":"heard","turn":1,"text":"¿Cómo se dice tenedor?"}""",
            """{"type":"reply","turn":1,"text":"Se dice así.","commentary":false,"lang":"es"}""",
            """{"type":"reply","turn":1,"text":"Eu uso o garfo.","commentary":false,"lang":"pt"}""",
            """{"type":"reply","turn":1,"text":"Muy bien.","commentary":false}""",
        )
        assertEquals(listOf(VoiceEffect.Speak(1, "Se dice así.", "es"), VoiceEffect.Speak(1, "Eu uso o garfo.", "pt"), VoiceEffect.Speak(1, "Muy bien.")), fx)
    }

    @Test fun pronounceShowsThePhraseAndTheReplyAfterItSaysIt() {
        val (view, fx) = run(
            VoiceView(lang = "pt"),
            """{"type":"heard","turn":2,"text":"¿Cómo se dice tenedor?"}""",
            """{"type":"pronounce","turn":2,"text":" o garfo ","meaning":"el tenedor","lang":"pt"}""",
            """{"type":"reply","turn":2,"text":"O garfo.","commentary":false,"lang":"pt"}""",
        )
        assertEquals(Pronounce("o garfo", "el tenedor", "pt", 2), view.pronounce)
        // The card says nothing itself; the sentence after it is spoken in Portuguese, once.
        assertEquals(listOf(VoiceEffect.Speak(2, "O garfo.", "pt")), fx)
        // A newer phrase replaces the card; without lang it is the session's target; without turn or meaning it still shows.
        val (next, _) = run(view, """{"type":"pronounce","text":"a xícara"}""")
        assertEquals(Pronounce("a xícara", "", "pt", null), next.pronounce)
    }

    @Test fun anEmptyPronounceOrOneOfACancelledTurnChangesNothing() {
        val (view, fx) = run(VoiceView(lang = "pt"), """{"type":"pronounce","turn":1,"text":"  "}""")
        assertNull(view.pronounce)
        assertEquals(emptyList<VoiceEffect>(), fx)
        val (late, lateFx) = run(
            VoiceView(lang = "pt"),
            """{"type":"heard","turn":3,"text":"¿Y taza?"}""",
            """{"type":"bargeIn","turn":3}""",
            """{"type":"pronounce","turn":3,"text":"a xícara","meaning":"la taza"}""",
        )
        assertNull(late.pronounce)
        assertEquals(listOf<VoiceEffect>(VoiceEffect.StopSpeaking), lateFx)
    }

    @Test fun theHubVoiceIsTheTargetsOwnElseVersSpanishOne() {
        assertEquals("coach-pt", Coach.hubVoice("pt"))
        assertEquals("coach-pt", Coach.hubVoice("PT"))
        assertEquals("sight", Coach.hubVoice("es"))
        assertEquals("sight", Coach.hubVoice(null))
        assertEquals("sight", Coach.hubVoice("fr"))
    }

    @Test fun thePhoneVoiceIsBrazilianFirstThenAnyPortuguese() {
        assertEquals("pt-BR", Coach.phoneVoice(Coach.PT, listOf("es-US", "pt-PT", "pt_BR")))
        assertEquals("pt-PT", Coach.phoneVoice(Coach.PT, listOf("es-US", "pt-PT")))
        assertEquals("pt", Coach.phoneVoice(Coach.PT, listOf("en-US", "pt")))
        assertNull(Coach.phoneVoice(Coach.PT, listOf("es-US", "es-ES", "en-US")))
        assertNull(Coach.phoneVoice(Coach.PT, emptyList()))
    }

    @Test fun hubVoiceThenPhoneVoiceThenTextAndSlowerPrefersThePhone() {
        assertEquals(Coach.Way.Hub, Coach.way(hubAudio = true, phoneVoice = true))
        assertEquals(Coach.Way.Phone, Coach.way(hubAudio = false, phoneVoice = true))
        assertEquals(Coach.Way.Text, Coach.way(hubAudio = false, phoneVoice = false))
        assertEquals(Coach.Way.Phone, Coach.way(hubAudio = true, phoneVoice = true, slow = true))
        assertEquals(Coach.Way.Hub, Coach.way(hubAudio = true, phoneVoice = false, slow = true))
        assertEquals(Coach.Way.Text, Coach.way(hubAudio = false, phoneVoice = false, slow = true))
        assertEquals(0.8f, Coach.SLOW_RATE)
    }

    @Test fun talkBackHearsThePhraseItsMeaningAndWhatEachButtonDoes() {
        val p = Pronounce("o garfo", "el tenedor", "pt")
        assertEquals("En portugués: o garfo. Significa: el tenedor", Coach.phraseDescription(p, Coach.PT))
        assertEquals("En portugués: o garfo", Coach.phraseDescription(p.copy(meaning = ""), Coach.PT))
        assertEquals("Más despacio: decir «o garfo» otra vez, más lento", Coach.slowerDescription(p))
        assertEquals("Repetir: decir «o garfo» otra vez", Coach.repeatDescription(p))
    }

    @Test fun idiomasIsAConversationNotARecording() {
        assertEquals(null, RecordChoice.assistToSet(RecordChoice.Mode.Coach, assistMode = "assist"))
        assertEquals(false, RecordChoice.choosesDevice(RecordChoice.Mode.Coach))
        assertEquals(true, RecordChoice.choosesDevice(RecordChoice.Mode.Assist))
        assertEquals("Empezar a hablar", RecordChoice.startLabel(RecordChoice.Mode.Coach))
    }
}
