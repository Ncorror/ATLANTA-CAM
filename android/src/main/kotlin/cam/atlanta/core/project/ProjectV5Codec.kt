package cam.atlanta.core.project

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.doubleOrNull

class ProjectV5 internal constructor(
  val json: JsonObject,
  val values: ProjectParameters,
  val operations: List<ProjectOperation>,
  val activeOperation: ProjectOperation,
  val nextOperation: Int,
  val rawDxf: String,
  val ncText: String,
)

class ProjectOperation internal constructor(
  val json: JsonObject,
  val id: String,
  val kind: OperationKind,
  val parameters: ProjectParameters,
)

enum class OperationKind { PROFILE, DRILL }

class ProjectParameters internal constructor(val json: JsonObject) {
  val zReferenceEnabled: Boolean get() = json["zReferenceEnabled"] == JsonPrimitive(true)
}

/** Reads the project container. DXF and sketch data are kept verbatim for the geometry importer. */
object ProjectV5Codec {
  private const val APP = "ATLANTA_CAM_OFFLINE"
  private const val MAX_OPERATIONS = 32
  private const val MAX_TOOLS = 1000
  private const val MAX_EMBEDDED_TEXT_LENGTH = 6_000_000
  private const val MAX_OPERATION_ID = 99_999_999
  private val operationId = Regex("primary|o[1-9][0-9]{0,7}")
  private val operationColor = Regex("#[0-9a-fA-F]{6}")
  private val jsonNumber = Regex("-?(0|[1-9][0-9]*)(\\.[0-9]+)?([eE][+-]?[0-9]+)?")
  private val emptyParameters = ProjectParameters(JsonObject(emptyMap()))

  fun decode(text: String): ProjectV5 {
    val content = text.removePrefix("\uFEFF")
    checkJsonTokens(content)
    val root = try {
      Json.parseToJsonElement(content)
    } catch (error: SerializationException) {
      throw IllegalArgumentException("Повреждён JSON проекта ATLANTA CAM.", error)
    }
    require(root is JsonObject) { "Это не проект ATLANTA CAM." }
    return readProject(root)
  }

  /** Creates a project from an edited v5 document and validates it on the same path as import. */
  fun fromJson(json: JsonObject): ProjectV5 {
    requireJsonLiterals(json)
    return readProject(json)
  }

  fun encode(project: ProjectV5): String = project.json.toString()

  private fun readProject(json: JsonObject): ProjectV5 {
    require(json["app"].stringValue() == APP) { "Это не проект ATLANTA CAM." }
    require(json["version"].numberValue() == 5.0) { "Поддерживаются проекты ATLANTA CAM формата 5." }
    val values = json["values"] as? JsonObject
      ?: throw IllegalArgumentException("Повреждены параметры проекта.")
    val rawDxf = json["rawDxf"].stringValue()
    val ncText = json["ncText"].stringValue()
    require(rawDxf != null && ncText != null && rawDxf.length.toLong() + ncText.length <= MAX_EMBEDDED_TEXT_LENGTH) {
      "Слишком большой или повреждённый проект."
    }
    val sketch = json["sketch"]
    if (sketch != null && sketch != JsonNull) {
      require(sketch is JsonObject && sketch["items"] is JsonArray) {
        "Повреждён список элементов проекта."
      }
    }

    val rows = json["operations"] as? JsonArray
    require(rows != null && rows.size in 1..MAX_OPERATIONS) { "Повреждён список операций проекта." }
    val operations = rows.map(::readOperation)
    val byId = operations.associateBy(ProjectOperation::id)
    require(byId.size == operations.size) { "Номера операций проекта должны быть уникальными." }
    val activeOperation = byId[json["activeOperationId"].stringValue()]
      ?: throw IllegalArgumentException("Повреждён выбор операции проекта.")
    val maxId = operations.maxOf { it.id.removePrefix("o").toIntOrNull() ?: 0 }
    val nextOperation = maxOf(maxId + 1, json["nextOperation"].integerIn(1..MAX_OPERATION_ID) ?: 1)

    val tools = json["tools"] as? JsonArray
    require(tools != null && tools.size <= MAX_TOOLS) { "Повреждён список инструментов проекта." }
    val toolNumbers = tools.map { (it as? JsonObject)?.get("number").integerIn(1..9999) }
    require(null !in toolNumbers && toolNumbers.toSet().size == tools.size) {
      "Номера инструментов должны быть уникальными числами от 1 до 9999."
    }
    return ProjectV5(json, ProjectParameters(values), operations, activeOperation, nextOperation, rawDxf, ncText)
  }

  private fun readOperation(element: JsonElement): ProjectOperation {
    require(element is JsonObject) { "Повреждены параметры операции проекта." }
    val id = element["id"].stringValue()
    val kind = when (element["kind"].stringValue()) {
      "profile" -> OperationKind.PROFILE
      "drill" -> OperationKind.DRILL
      else -> throw IllegalArgumentException("Неизвестный вид операции проекта.")
    }
    val color = element["color"].stringValue()
    require(id != null && operationId.matches(id) && (id != "primary" || kind == OperationKind.PROFILE) &&
      color != null && operationColor.matches(color)) {
      "Повреждены параметры операции проекта."
    }
    val toolNumber = element["toolNumber"]
    require(toolNumber == null || toolNumber == JsonNull || toolNumber.integerIn(1..9999) != null) {
      "Повреждён номер инструмента операции."
    }
    val parameters = (element["params"] as? JsonObject)?.let(::ProjectParameters) ?: emptyParameters
    return ProjectOperation(element, id, kind, parameters)
  }

  private fun JsonElement?.stringValue(): String? = (this as? JsonPrimitive)?.takeIf { it.isString }?.content

  private fun JsonElement?.numberValue(): Double? = (this as? JsonPrimitive)?.takeUnless { it.isString }?.doubleOrNull

  private fun JsonElement?.integerIn(range: IntRange): Int? {
    val number = numberValue() ?: return null
    val integer = number.toInt()
    return integer.takeIf { it in range && it.toDouble() == number }
  }

  // JsonElement accepts unquoted literals beyond JSON numbers and booleans.
  private fun requireJsonLiterals(root: JsonElement) {
    val remaining = ArrayDeque<JsonElement>()
    remaining.add(root)
    while (remaining.isNotEmpty()) {
      when (val element = remaining.removeLast()) {
        is JsonObject -> remaining.addAll(element.values)
        is JsonArray -> remaining.addAll(element)
        is JsonPrimitive -> require(
          element.isString || isJsonLiteral(element.content),
        ) { "Недопустимое значение в JSON проекта." }
      }
    }
  }

  private fun isJsonLiteral(text: String): Boolean =
    text == "null" || text == "true" || text == "false" || jsonNumber.matches(text)

  // Check lexemes that the tree parser allows through, including values lost to duplicate keys.
  private fun checkJsonTokens(text: String) {
    var quoted = false
    var escaped = false
    var literalStart = -1

    fun finishLiteral(end: Int) {
      if (literalStart >= 0) {
        require(isJsonLiteral(text.substring(literalStart, end))) { "Недопустимое значение в JSON проекта." }
        literalStart = -1
      }
    }

    for (index in text.indices) {
      val char = text[index]
      if (quoted) {
        require(char >= ' ') { "Управляющий символ в JSON проекта должен быть экранирован." }
        when {
          escaped -> escaped = false
          char == '"' -> quoted = false
          char == '\\' -> escaped = true
        }
      } else {
        when (char) {
          '"' -> {
            finishLiteral(index)
            quoted = true
          }
          '{', '}', '[', ']', ',', ':', ' ', '\t', '\n', '\r' -> finishLiteral(index)
          else -> if (literalStart < 0) literalStart = index
        }
      }
    }
    finishLiteral(text.length)
  }
}
