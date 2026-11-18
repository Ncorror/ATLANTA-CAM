package cam.atlanta.core.project

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ProjectV5CodecTest {
  @Test
  fun `round trips the browser fixtures without converting strings to numbers`() {
    for ((name, stringDepth) in listOf("blank-project.json" to true, "operation-project.json" to false)) {
      val content = checkNotNull(javaClass.getResourceAsStream("/$name")) { "Missing fixture $name" }
        .bufferedReader().use { it.readText() }
      val original = Json.parseToJsonElement(content).jsonObject
      val project = ProjectV5Codec.decode(content)

      assertEquals(original, project.json, name)
      assertEquals(original, Json.parseToJsonElement(ProjectV5Codec.encode(project)), name)
      assertEquals("primary", project.activeOperation.id, name)
      assertEquals(stringDepth, project.activeOperation.parameters.json.getValue("depth").jsonPrimitive.isString, name)
      assertEquals(original.getValue("rawDxf").jsonPrimitive.content, project.rawDxf, name)
      assertEquals(original.getValue("ncText").jsonPrimitive.content, project.ncText, name)
      assertFalse(project.activeOperation.parameters.zReferenceEnabled, name)
    }
  }

  @Test
  fun `preserves operation order selected drill and unknown nested fields`() {
    val profile = operation("o8")
    val drill = JsonObject(
      operation("o4", "drill") + mapOf(
        "drill" to JsonObject(mapOf("cycle" to JsonPrimitive("81"), "depth" to JsonPrimitive("-9"))),
        "extension" to JsonObject(mapOf("future" to JsonNull)),
      ),
    )
    val original = JsonObject(
      document(profile, drill) + mapOf(
        "activeOperationId" to JsonPrimitive("o4"),
        "nextOperation" to JsonPrimitive(2),
        "extension" to JsonArray(listOf(JsonPrimitive(7), JsonPrimitive("7"), JsonNull)),
        "rawDxf" to JsonPrimitive("0\r\nSECTION\r\n"),
        "ncText" to JsonPrimitive("G92X0Y0Z30000\n"),
      ),
    )

    val project = ProjectV5Codec.fromJson(original)
    assertEquals(listOf("o8", "o4"), project.operations.map { it.id })
    assertEquals("o4", project.activeOperation.id)
    assertEquals(OperationKind.DRILL, project.activeOperation.kind)
    assertEquals(OperationKind.PROFILE, project.operations.first().kind)
    assertEquals(drill, project.activeOperation.json)
    assertEquals(9, project.nextOperation)
    assertEquals("0\r\nSECTION\r\n", project.rawDxf)
    assertEquals("G92X0Y0Z30000\n", project.ncText)
    assertEquals(original, ProjectV5Codec.decode(ProjectV5Codec.encode(project)).json)
  }

  @Test
  fun `honors a larger operation counter and leaves an absent counter absent`() {
    val original = document(operation("o4"))
    val withCounter = JsonObject(original + ("nextOperation" to JsonPrimitive(20)))

    val implicit = ProjectV5Codec.fromJson(original)
    assertEquals(5, implicit.nextOperation)
    assertFalse("nextOperation" in ProjectV5Codec.decode(ProjectV5Codec.encode(implicit)).json)
    assertEquals(20, ProjectV5Codec.fromJson(withCounter).nextOperation)
  }

  @Test
  fun `keeps imported Z settings independent and enables only the boolean true`() {
    for (value in listOf(null, JsonNull, JsonPrimitive(false), JsonPrimitive("true"), JsonPrimitive(true))) {
      val params = JsonObject(if (value == null) emptyMap() else mapOf("zReferenceEnabled" to value))
      val profile = JsonObject(operation("primary") + ("params" to params))
      val original = JsonObject(
        document(profile) + ("values" to JsonObject(mapOf("zReferenceEnabled" to JsonPrimitive(true)))),
      )

      val project = ProjectV5Codec.fromJson(original)
      assertTrue(project.values.zReferenceEnabled)
      assertEquals(value == JsonPrimitive(true), project.activeOperation.parameters.zReferenceEnabled)
      assertEquals(params, project.activeOperation.parameters.json)
      assertEquals(original, ProjectV5Codec.decode(ProjectV5Codec.encode(project)).json)
    }
  }

  @Test
  fun `defaults missing and null operation parameters without inserting them on save`() {
    for (profile in listOf(operation("primary"), JsonObject(operation("primary") + ("params" to JsonNull)))) {
      val original = document(profile)
      val project = ProjectV5Codec.fromJson(original)

      assertTrue(project.activeOperation.parameters.json.isEmpty())
      assertFalse(project.activeOperation.parameters.zReferenceEnabled)
      assertEquals(original, ProjectV5Codec.decode(ProjectV5Codec.encode(project)).json)
    }
  }

  @Test
  fun `accepts only the ATLANTA CAM marker and numeric version five`() {
    val original = document(operation("primary"))
    val invalidHeaders = listOf(
      "app" to JsonPrimitive("ATLANTA-tools"),
      "version" to JsonPrimitive("5"),
      "version" to JsonPrimitive(true),
      "version" to JsonPrimitive(4),
      "version" to JsonPrimitive(6),
    )
    for ((key, value) in invalidHeaders) {
      assertFailsWith<IllegalArgumentException> {
        ProjectV5Codec.fromJson(JsonObject(original + (key to value)))
      }
    }
    for (numericVersion in listOf("5", "5.0", "5e0")) {
      val accepted = JsonObject(original + ("version" to Json.parseToJsonElement(numericVersion)))
      assertEquals(accepted, ProjectV5Codec.decode(accepted.toString()).json)
    }
  }

  @Test
  fun `rejects malformed JSON and invalid project envelope fields`() {
    for (input in listOf("{", "[]", "null", "{} {}")) {
      assertFailsWith<IllegalArgumentException> { ProjectV5Codec.decode(input) }
    }
    val original = document(operation("primary"))
    val invalidFields = listOf(
      "values" to JsonArray(emptyList()),
      "rawDxf" to JsonPrimitive(0),
      "ncText" to JsonNull,
      "tools" to JsonObject(emptyMap()),
      "operations" to JsonArray(emptyList()),
    )
    for ((key, value) in invalidFields) {
      assertFailsWith<IllegalArgumentException> {
        ProjectV5Codec.fromJson(JsonObject(original + (key to value)))
      }
    }
  }

  @Test
  fun `rejects invalid JSON literals even in unknown and overwritten fields`() {
    val prefix = document(operation("primary")).toString().dropLast(1)
    val invalid = listOf(
      "\"extra\":undefined",
      "\"extra\":+1",
      "\"extra\":01",
      "\"extra\":NaN,\"extra\":true",
      "\"extra\":\"raw\nnewline\"",
    )
    for (field in invalid) {
      assertFailsWith<IllegalArgumentException> { ProjectV5Codec.decode("$prefix,$field}") }
    }
  }

  @Test
  fun `accepts a UTF-8 BOM and preserves escaped text and numeric literals`() {
    val prefix = document(operation("primary")).toString().dropLast(1)
    val fields = "\"extra\":[\"контур\\n\\\"A\\\"\\\\\",12345678901234567890,1e999]"
    val source = "$prefix,$fields}"

    assertEquals(source, ProjectV5Codec.encode(ProjectV5Codec.decode("\uFEFF$source")))
  }

  @Test
  fun `rejects bad operation identity kind and selection`() {
    val primary = operation("primary")
    for (original in listOf(
      document(primary, primary),
      document(operation("o0")),
      document(operation("primary", "drill")),
      document(operation("o1", "unknown")),
      JsonObject(document(primary) + ("activeOperationId" to JsonPrimitive("o3"))),
    )) {
      assertFailsWith<IllegalArgumentException> { ProjectV5Codec.fromJson(original) }
    }
  }

  private fun operation(id: String, kind: String = "profile"): JsonObject = JsonObject(
    mapOf("id" to JsonPrimitive(id), "kind" to JsonPrimitive(kind), "color" to JsonPrimitive("#d52b3e")),
  )

  private fun document(vararg operations: JsonObject): JsonObject = JsonObject(
    mapOf(
      "app" to JsonPrimitive("ATLANTA_CAM_OFFLINE"),
      "version" to JsonPrimitive(5),
      "values" to JsonObject(emptyMap()),
      "operations" to JsonArray(operations.toList()),
      "activeOperationId" to operations.first().getValue("id"),
      "tools" to JsonArray(emptyList()),
      "rawDxf" to JsonPrimitive(""),
      "ncText" to JsonPrimitive(""),
    ),
  )
}
