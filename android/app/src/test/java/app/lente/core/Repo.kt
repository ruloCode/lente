package app.lente.core

import java.io.File

/** Files from the rest of the repository, so the app is checked against what the hub and firmware use. */
object Repo {
    val root: File = generateSequence(File("").absoluteFile) { it.parentFile }.first { File(it, "openspec").isDirectory }
    fun text(path: String) = File(root, path).readText()
    fun resource(name: String) = javaClass.classLoader!!.getResource(name)!!.readText()
}
