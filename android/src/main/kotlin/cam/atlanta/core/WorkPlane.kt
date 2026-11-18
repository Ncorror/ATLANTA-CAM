package cam.atlanta.core

data class Point3(val x: Double, val y: Double, val z: Double = 0.0)

enum class WorkPlane(val id: String, val code: Int, val axes: String, val offsets: String) {
  XY("xy", 17, "XYZ", "IJK"),
  ZX("zx", 18, "XZY", "IKJ"),
  YZ("yz", 19, "YZX", "JKI");

  private val worldWords = axes + offsets

  fun toWorld(point: Point3): Point3 = when (this) {
    XY -> point
    ZX -> Point3(point.x, point.z, point.y)
    YZ -> Point3(point.z, point.x, point.y)
  }

  fun toLocal(point: Point3): Point3 = when (this) {
    XY -> point
    ZX -> Point3(point.x, point.z, point.y)
    YZ -> Point3(point.y, point.z, point.x)
  }

  /** Remaps local XY program words to this plane, or recovers local XY words in inverse mode. */
  fun remapCommand(command: String, inverse: Boolean = false): String {
    if (this == XY) return command
    val fromWords = if (inverse) worldWords else LOCAL_WORDS
    val toWords = if (inverse) LOCAL_WORDS else worldWords
    return block.replace(command) { line ->
      if (physicalBlock.containsMatchIn(line.value)) return@replace line.value
      wordOrComment.replace(line.value) { token ->
        val address = token.groups[1]?.value?.single()?.uppercaseChar()
        val raw = token.groupValues[2]
        when (address) {
          null -> token.value
          'G' -> remapGWord(raw, inverse)
          else -> {
            val index = fromWords.indexOf(address)
            val mapped = if (index < 0) address else toWords[index]
            "$mapped$raw"
          }
        }
      }
    }
  }

  private fun remapGWord(raw: String, inverse: Boolean): String {
    val value = raw.toDouble()
    val sourceCode = if (inverse) code else XY.code
    val targetCode = if (inverse) XY.code else code
    return when {
      value == sourceCode.toDouble() -> "G$targetCode"
      this != ZX -> "G$raw"
      else -> when (value) {
        2.0 -> "G03"
        3.0 -> "G02"
        41.0 -> "G42"
        42.0 -> "G41"
        else -> "G$raw"
      }
    }
  }

  companion object {
    private const val LOCAL_WORDS = "XYZIJK"
    private const val PLANE_ERROR = "Выбери рабочую плоскость XY, ZX или YZ."
    // Match the web engine's whitespace between an address and its number within a block.
    private const val WORD_SPACE = "\\t\\u000B\\u000C \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF"
    private val block = Regex("""[^\r\n]+""")
    private val physicalBlock = Regex("""[Gg][$WORD_SPACE]*0*(?:25|92)(?![0-9.])""")
    private val wordOrComment = Regex(
      """\([^)]*\)|;[^\r\n]*|([A-Za-z])[$WORD_SPACE]*([+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+))""",
    )

    fun fromId(id: String): WorkPlane = if (id == "xz") ZX else
      entries.firstOrNull { it.id == id } ?: throw IllegalArgumentException(PLANE_ERROR)

    fun fromCode(code: Int): WorkPlane = entries.firstOrNull { it.code == code }
      ?: throw IllegalArgumentException(PLANE_ERROR)
  }
}
