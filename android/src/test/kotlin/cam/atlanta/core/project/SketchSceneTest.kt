package cam.atlanta.core.project

import cam.atlanta.core.geometry.ArcSegment
import cam.atlanta.core.geometry.Bounds2
import cam.atlanta.core.geometry.ContourSide
import cam.atlanta.core.geometry.LineSegment
import cam.atlanta.core.geometry.Point2
import cam.atlanta.core.geometry.segmentBounds
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlin.math.PI
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertIs
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SketchSceneTest {
  @Test
  fun `reads the marked circle in the saved web project`() {
    val project = fixture("operation-project.json")
    val scene = assertNotNull(project.sketchScene())

    val circle = scene.plan.contours.single()
    assertTrue(circle.closed)
    assertFalse(circle.ambiguous)
    assertEquals(ContourSide.OUTSIDE, circle.autoSide)
    assertEquals(2, circle.segments.size)
    for (segment in circle.segments) {
      val arc = assertIs<ArcSegment>(segment)
      assertEquals(Point2(0.0, 0.0), arc.center)
      assertEquals(30.0, arc.radius)
      assertEquals(PI, arc.sweep)
    }
    val bounds = segmentBounds(circle.segments)
    assertEquals(Bounds2(-30.0, -30.0, 30.0, 30.0), bounds)
    assertEquals(circle, scene.machining.contours.single())
    assertEquals(1, scene.markedCount)
    assertTrue(scene.drillCenters.isEmpty())
  }

  @Test
  fun `distinguishes a blank sketch from a project without an embedded sketch`() {
    val blank = fixture("blank-project.json")
    val scene = assertNotNull(blank.sketchScene())
    assertTrue(scene.plan.contours.isEmpty())
    assertTrue(scene.machining.contours.isEmpty())
    assertTrue(scene.drillCenters.isEmpty())
    assertEquals(0, scene.markedCount)

    assertNull(ProjectV5Codec.fromJson(JsonObject(blank.json - "sketch")).sketchScene())
    assertNull(ProjectV5Codec.fromJson(JsonObject(blank.json + ("sketch" to JsonNull))).sketchScene())
  }

  @Test
  fun `selects milling and drilling marks by operation ID`() {
    val project = project(
      """
        {"id":"a","type":"circle","c":{"x":0,"y":0},"r":2,"machining":true},
        {"id":"b","type":"circle","c":{"x":12,"y":5},"r":3,"millOps":["o1"],"drillOps":["o2"]},
        {"id":"c","type":"circle","c":{"x":23,"y":-4},"r":1,"drillOps":["o2"]},
        {"id":"reference","type":"line","a":{"x":-1,"y":0},"b":{"x":30,"y":0},"construction":true,"guide":true}
      """.trimIndent(),
      active = "o1",
    )

    val secondary = assertNotNull(project.sketchScene())
    assertEquals(3, secondary.plan.contours.size)
    assertEquals(Point2(12.0, 5.0), selectedCircleCenter(secondary))
    assertEquals(1, secondary.markedCount)
    assertTrue(secondary.drillCenters.isEmpty())

    val primary = assertNotNull(project.sketchScene(project.operations.first()))
    assertEquals(secondary.plan, primary.plan)
    assertEquals(Point2(0.0, 0.0), selectedCircleCenter(primary))
    assertEquals(1, primary.markedCount)

    val drill = assertNotNull(project.sketchScene(project.operations.last()))
    assertEquals(secondary.plan, drill.plan)
    assertEquals(listOf(Point2(12.0, 5.0), Point2(23.0, -4.0)), drill.drillCenters)
    assertTrue(drill.machining.contours.isEmpty())
  }

  @Test
  fun `inherits nesting when only the inner closed contour is marked`() {
    val project = project(
      """
        {"id":"outer","type":"circle","c":{"x":0,"y":0},"r":12},
        {"id":"inner","type":"circle","c":{"x":0,"y":0},"r":3,"machining":true}
      """.trimIndent(),
    )
    val scene = assertNotNull(project.sketchScene())

    assertEquals(listOf(0, 1), scene.plan.contours.map { it.nesting })
    val inner = scene.machining.contours.single()
    assertEquals(1, inner.nesting)
    assertEquals(ContourSide.INSIDE, inner.autoSide)
    assertTrue(scene.machining.warnings.isEmpty())
  }

  @Test
  fun `finds material to the left of a selected wall on a counterclockwise boundary`() {
    val project = project(
      """
        {"id":"south","type":"line","a":{"x":0,"y":0},"b":{"x":10,"y":0},"machining":true},
        {"id":"east","type":"line","a":{"x":10,"y":0},"b":{"x":10,"y":10}},
        {"id":"north","type":"line","a":{"x":10,"y":10},"b":{"x":0,"y":10}},
        {"id":"west","type":"line","a":{"x":0,"y":10},"b":{"x":0,"y":0}}
      """.trimIndent(),
    )
    val scene = assertNotNull(project.sketchScene())

    assertTrue(scene.plan.contours.single().closed)
    val wall = scene.machining.contours.single()
    assertFalse(wall.closed)
    assertEquals(listOf(LineSegment(Point2(0.0, 0.0), Point2(10.0, 0.0))), wall.segments)
    assertEquals(1, wall.materialLeft)
    assertTrue(scene.machining.warnings.any { it.contains("отдельным элементам") })
  }

  @Test
  fun `retains a junction when only one incident line is selected`() {
    val project = project(
      """
        {"id":"first","type":"line","a":{"x":0,"y":0},"b":{"x":10,"y":0},"machining":true},
        {"id":"straight","type":"line","a":{"x":10,"y":0},"b":{"x":20,"y":0}},
        {"id":"branch","type":"line","a":{"x":10,"y":0},"b":{"x":10,"y":10}}
      """.trimIndent(),
    )
    val scene = assertNotNull(project.sketchScene())

    assertTrue(scene.plan.contours.any { it.ambiguous })
    val wall = scene.machining.contours.single()
    assertFalse(wall.ambiguous)
    assertTrue(wall.preserveJunctions)
  }

  @Test
  fun `rejects damaged circle line and arc geometry before creating contours`() {
    val items = listOf(
      """{"id":"bad","type":"circle","c":{"x":0,"y":0},"r":0}""",
      """{"id":"bad","type":"circle","c":{"x":"0","y":0},"r":2}""",
      """{"id":"bad","type":"line","a":{"x":0,"y":0},"b":{"x":0.001,"y":0}}""",
      """{"id":"bad","type":"arc","a":{"x":0,"y":0},"m":{"x":1,"y":1},"b":{"x":2,"y":2}}""",
      """{"id":"bad","type":"line","a":{"x":1000000,"y":0},"b":{"x":999999,"y":0}}""",
      """{"id":"bad","type":"circle","c":{"x":0,"y":0},"r":2,"unconfirmed":true}""",
    )
    for (item in items) {
      assertFailsWith<IllegalArgumentException>(item) { project(item).sketchScene() }
    }
  }

  @Test
  fun `rejects duplicate IDs and invalid machining marks`() {
    val circle = """{"id":"c","type":"circle","c":{"x":0,"y":0},"r":2}"""
    val items = listOf(
      "$circle,$circle",
      """{"id":"bad","type":"circle","c":{"x":0,"y":0},"r":2,"machining":"true"}""",
      """{"id":"bad","type":"circle","c":{"x":0,"y":0},"r":2,"millOps":["o1","o1"]}""",
      """{"id":"bad","type":"circle","c":{"x":0,"y":0},"r":2,"construction":true,"machining":true}""",
      """{"id":"bad","type":"line","a":{"x":0,"y":0},"b":{"x":2,"y":0},"drillOps":["o2"]}""",
    )
    for (item in items) {
      assertFailsWith<IllegalArgumentException>(item) { project(item).sketchScene() }
    }
  }

  private fun selectedCircleCenter(scene: SketchScene): Point2 =
    assertIs<ArcSegment>(scene.machining.contours.single().segments.first()).center

  private fun fixture(name: String): ProjectV5 = ProjectV5Codec.decode(
    checkNotNull(javaClass.getResourceAsStream("/$name")).bufferedReader().use { it.readText() },
  )

  private fun project(items: String, active: String = "primary"): ProjectV5 = ProjectV5Codec.decode(
    """
      {
        "app":"ATLANTA_CAM_OFFLINE","version":5,"values":{},"rawDxf":"","ncText":"","tools":[],
        "activeOperationId":"$active",
        "operations":[
          {"id":"primary","kind":"profile","color":"#d52b3e"},
          {"id":"o1","kind":"profile","color":"#2c9cbe"},
          {"id":"o2","kind":"drill","color":"#168343"}
        ],
        "sketch":{"items":[$items]}
      }
    """.trimIndent(),
  )
}
