package cam.atlanta.android

import android.app.Activity
import android.app.Instrumentation.ActivityResult
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.Canvas
import android.net.Uri
import android.os.SystemClock
import android.view.View
import android.widget.Spinner
import android.widget.TextView
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class ProjectImportTest {
  private val instrumentation = InstrumentationRegistry.getInstrumentation()

  @Test
  fun opensSavedProjectAndDrawsItsMarkedContour() = withActivity { activity ->
    val before = previewDescription(activity)
    open(activity, "operation-project.json")

    await("project geometry") {
      text(activity, R.id.scene_summary) == summary(1, 1, 0)
    }
    assertEquals("operation-project.json", text(activity, R.id.project_name))
    assertEquals(1, onMain { activity.findViewById<Spinner>(R.id.operation_picker).count })
    assertNotEquals(before, previewDescription(activity))
    assertTrue(onMain {
      val preview = activity.findViewById<View>(R.id.sketch_preview)
      preview.isShown && preview.width > 0 && preview.height > 0
    })
  }

  @Test
  fun changesThePreviewWhenTheDrillOperationIsSelected() = withActivity { activity ->
    open(activity, ProjectFixtureProvider.MULTIPLE_OPERATIONS)
    await("profile geometry") {
      text(activity, R.id.scene_summary) == summary(1, 1, 0)
    }
    val profile = previewDescription(activity)
    val profileCenter = previewCenterPixel(activity)
    val spinner = onMain { activity.findViewById<Spinner>(R.id.operation_picker) }
    assertEquals(2, onMain { spinner.count })
    onMain { spinner.setSelection(1) }

    await("drill centers") {
      text(activity, R.id.scene_summary) == summary(1, 0, 1)
    }
    assertNotEquals(profile, previewDescription(activity))
    assertNotEquals("Canvas should draw the new drill center", profileCenter, previewCenterPixel(activity))
  }

  @Test
  fun opensBlankProjectAndKeepsItWhenAnInvalidFileIsSelected() = withActivity { activity ->
    open(activity, "blank-project.json")
    await("blank project opened") {
      text(activity, R.id.project_name) == "blank-project.json"
    }
    val blankSummary = text(activity, R.id.scene_summary)
    open(activity, "config.json")

    await("invalid project message") {
      text(activity, R.id.status_message).startsWith("Не удалось открыть проект.")
    }
    assertEquals("blank-project.json", text(activity, R.id.project_name))
    assertEquals(blankSummary, text(activity, R.id.scene_summary))
  }

  private fun open(activity: Activity, fixture: String) {
    val uri = Uri.Builder().scheme("content").authority(ProjectFixtureProvider.AUTHORITY)
      .appendPath(fixture).build()
    val filter = IntentFilter(Intent.ACTION_OPEN_DOCUMENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      addDataType("*/*")
    }
    val result = ActivityResult(Activity.RESULT_OK, Intent().setData(uri))
    val monitor = instrumentation.addMonitor(filter, result, true)
    try {
      assertTrue(onMain { activity.findViewById<View>(R.id.open_project).performClick() })
      assertEquals("Must launch Android's document picker", 1, monitor.hits)
    } finally {
      instrumentation.removeMonitor(monitor)
    }
  }

  private fun withActivity(test: (Activity) -> Unit) {
    val intent = Intent(instrumentation.targetContext, MainActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val activity = instrumentation.startActivitySync(intent)
    try {
      test(activity)
    } finally {
      onMain { activity.finish() }
      instrumentation.waitForIdleSync()
    }
  }

  private fun await(description: String, ready: () -> Boolean) {
    val deadline = SystemClock.uptimeMillis() + 10_000
    while (SystemClock.uptimeMillis() < deadline) {
      if (ready()) return
      SystemClock.sleep(25)
    }
    fail("Timed out waiting for $description")
  }

  private fun <T> onMain(block: () -> T): T {
    var result: Result<T>? = null
    instrumentation.runOnMainSync { result = runCatching(block) }
    return checkNotNull(result).getOrThrow()
  }

  private fun text(activity: Activity, viewId: Int): String = onMain {
    activity.findViewById<TextView>(viewId).text.toString()
  }

  private fun previewDescription(activity: Activity): String = onMain {
    activity.findViewById<View>(R.id.sketch_preview).contentDescription.toString()
  }

  private fun previewCenterPixel(activity: Activity): Int = onMain {
    val view = activity.findViewById<View>(R.id.sketch_preview)
    val image = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
    try {
      view.draw(Canvas(image))
      image.getPixel(image.width / 2, image.height / 2)
    } finally {
      image.recycle()
    }
  }

  private fun summary(plan: Int, machining: Int, drill: Int): String =
    "Контуры чертежа: $plan · В операции: $machining · Сверление: $drill"
}
