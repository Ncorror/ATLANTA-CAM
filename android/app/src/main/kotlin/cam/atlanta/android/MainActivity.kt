package cam.atlanta.android

import android.app.Activity
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.text.TextUtils
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import cam.atlanta.core.dxf.DxfDrawing
import cam.atlanta.core.dxf.DxfOptions
import cam.atlanta.core.dxf.readDxf
import cam.atlanta.core.project.OperationKind
import cam.atlanta.core.project.ProjectOperation
import cam.atlanta.core.project.ProjectV5
import cam.atlanta.core.project.ProjectV5Codec
import cam.atlanta.core.project.SketchScene
import cam.atlanta.core.project.embeddedDxf
import cam.atlanta.core.project.sketchScene
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.Charset
import java.util.concurrent.Executors

class MainActivity : Activity() {
  private val worker = Executors.newSingleThreadExecutor()
  private lateinit var openButton: Button
  private lateinit var projectName: TextView
  private lateinit var operationPicker: Spinner
  private lateinit var summary: TextView
  private lateinit var status: TextView
  private lateinit var preview: SketchPreview
  private var opened: OpenedDocument? = null
  private var selectedOperation: ProjectOperation? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setContentView(createScreen())
    savedInstanceState?.getString(STATE_URI)?.let { uri ->
      openDocument(Uri.parse(uri), savedInstanceState.getString(STATE_OPERATION))
    }
  }

  override fun onSaveInstanceState(outState: Bundle) {
    super.onSaveInstanceState(outState)
    outState.putString(STATE_URI, opened?.uri?.toString())
    outState.putString(STATE_OPERATION, selectedOperation?.id)
  }

  override fun onDestroy() {
    worker.shutdownNow()
    super.onDestroy()
  }

  @Suppress("DEPRECATION")
  private fun chooseProject() {
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
      .addCategory(Intent.CATEGORY_OPENABLE)
      .setType("*/*")
      .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    startActivityForResult(intent, OPEN_PROJECT)
  }

  @Deprecated("The platform file picker returns its result here.")
  @Suppress("DEPRECATION")
  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    if (requestCode != OPEN_PROJECT || resultCode != RESULT_OK) return
    val uri = data?.data ?: return
    openDocument(uri)
  }

  private fun openDocument(uri: Uri, operationId: String? = null) {
    compute("Открываю файл…", "Не удалось открыть проект.", { loadDocument(uri, operationId) }) { (document, operation, scene) ->
      opened = document
      selectedOperation = operation
      projectName.text = document.name
      if (document.project != null && operation != null) {
        updateOperationPicker(document.project, operation)
      } else {
        operationPicker.onItemSelectedListener = null
        operationPicker.adapter = null
        operationPicker.visibility = View.GONE
      }
      val drawing = document.drawing
      if (drawing != null) showDxf(drawing, document.project != null) else showScene(scene)
    }
  }

  private fun loadDocument(uri: Uri, operationId: String?): LoadedDocument {
    val name = displayName(uri)
    val text = readDocumentText(uri)
    if (name.endsWith(".dxf", ignoreCase = true) ||
      (!name.endsWith(".json", ignoreCase = true) && looksLikeDxf(text))) {
      val drawing = readDxf(text, DxfOptions(tolerance = 0.02))
      return LoadedDocument(OpenedDocument(uri, name, drawing = drawing))
    }

    val project = ProjectV5Codec.decode(text)
    val operation = project.operations.firstOrNull { it.id == operationId } ?: project.activeOperation
    val scene = project.sketchScene(operation)
    val drawing = if (scene == null) project.embeddedDxf() else null
    return LoadedDocument(OpenedDocument(uri, name, project, drawing), operation, scene)
  }

  private fun looksLikeDxf(text: String): Boolean {
    val content = text.removePrefix("\uFEFF")
    return content.startsWith("AutoCAD Binary DXF") || DXF_SECTION.containsMatchIn(content)
  }

  private fun updateOperationPicker(project: ProjectV5, operation: ProjectOperation) {
    operationPicker.onItemSelectedListener = null
    val choices = project.operations.map { op ->
      when {
        op.id == "primary" -> "Основной профиль"
        op.kind == OperationKind.DRILL -> "${op.id} · Сверление"
        else -> "${op.id} · Профиль"
      }
    }
    operationPicker.adapter = ArrayAdapter(this, android.R.layout.simple_spinner_item, choices).apply {
      setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
    }
    operationPicker.setSelection(project.operations.indexOf(operation))
    operationPicker.visibility = View.VISIBLE
    operationPicker.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
      override fun onNothingSelected(parent: AdapterView<*>?) = Unit

      override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
        val next = project.operations.getOrNull(position) ?: return
        val document = opened ?: return
        if (next == selectedOperation || document.project != project) return
        if (document.drawing != null) {
          selectedOperation = next
          return
        }
        compute("Собираю контуры…", "Не удалось выбрать операцию.", { project.sketchScene(next) }) { scene ->
          selectedOperation = next
          showScene(scene)
        }
      }
    }
  }

  private fun showDxf(drawing: DxfDrawing, inProject: Boolean) {
    preview.showDxf(drawing.plan)
    summary.visibility = View.VISIBLE
    val layers = drawing.plan.contours.map { it.layer }.toSet().size
    summary.text = "Контуры чертежа: ${drawing.plan.contours.size} · Слои: $layers"
    status.text = when {
      drawing.plan.warnings.isNotEmpty() -> drawing.plan.warnings.joinToString("\n")
      inProject -> "Проект открыт"
      else -> "DXF открыт"
    }
  }

  private fun showScene(scene: SketchScene?) {
    preview.show(scene)
    summary.visibility = View.VISIBLE
    if (scene == null) {
      summary.text = "В проекте нет сохранённого эскиза"
      status.text = "Проект открыт"
      return
    }
    summary.text = "Контуры чертежа: ${scene.plan.contours.size} · " +
      "В операции: ${scene.machining.contours.size} · Сверление: ${scene.drillCenters.size}"
    val warnings = (scene.plan.warnings + scene.machining.warnings).distinct()
    status.text = if (warnings.isEmpty()) "Проект открыт" else warnings.joinToString("\n")
  }

  private fun <T> compute(progress: String, error: String, work: () -> T, apply: (T) -> Unit) {
    openButton.isEnabled = false
    operationPicker.isEnabled = false
    status.text = progress
    worker.execute {
      val result = try {
        Result.success(work())
      } catch (failure: Exception) {
        Result.failure(failure)
      }
      runOnUiThread {
        if (isDestroyed || isFinishing) return@runOnUiThread
        openButton.isEnabled = true
        operationPicker.isEnabled = true
        result.onSuccess(apply).onFailure { failure ->
          status.text = "$error ${failure.message.orEmpty()}".trimEnd()
        }
      }
    }
  }

  private fun readDocumentText(uri: Uri): String {
    val input = checkNotNull(contentResolver.openInputStream(uri)) { "Файл недоступен." }
    val output = ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    input.use {
      while (true) {
        val count = it.read(buffer)
        if (count < 0) break
        require(output.size() + count <= MAX_FILE_BYTES) { "Файл больше 6 МБ." }
        output.write(buffer, 0, count)
      }
    }
    val bytes = output.toByteArray()
    return try {
      Charsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes)).toString()
    } catch (_: CharacterCodingException) {
      String(bytes, Charset.forName("windows-1251"))
    }
  }

  private fun displayName(uri: Uri): String =
    contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
      if (cursor.moveToFirst()) cursor.getString(0) else null
    } ?: "Проект ATLANTA CAM"

  @Suppress("DEPRECATION")
  private fun createScreen(): View {
    val screen = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setBackgroundColor(Color.rgb(247, 249, 252))
      val horizontal = dp(16)
      val vertical = dp(8)
      setPadding(horizontal, vertical, horizontal, vertical)
      setOnApplyWindowInsetsListener { view, insets ->
        view.setPadding(
          horizontal + insets.systemWindowInsetLeft,
          vertical + insets.systemWindowInsetTop,
          horizontal + insets.systemWindowInsetRight,
          vertical + insets.systemWindowInsetBottom,
        )
        insets
      }
    }
    screen.addView(text("ATLANTA CAM", 24, bold = true))
    openButton = Button(this).apply {
      id = R.id.open_project
      text = "Открыть файл"
      isAllCaps = false
      setTextColor(Color.WHITE)
      backgroundTintList = ColorStateList.valueOf(Color.rgb(22, 76, 181))
      setOnClickListener { chooseProject() }
    }
    screen.addView(openButton, LinearLayout.LayoutParams(-1, -2).apply { topMargin = dp(6) })
    projectName = text("Проект не открыт", 16, bold = true).apply {
      id = R.id.project_name
      maxLines = 1
      ellipsize = TextUtils.TruncateAt.END
    }
    screen.addView(projectName)
    operationPicker = Spinner(this).apply {
      id = R.id.operation_picker
      contentDescription = "Операция обработки"
      visibility = View.GONE
      minimumHeight = dp(48)
    }
    screen.addView(operationPicker, LinearLayout.LayoutParams(-1, -2))
    summary = text("", 13).apply {
      id = R.id.scene_summary
      visibility = View.GONE
    }
    screen.addView(summary)
    preview = SketchPreview(this).apply { id = R.id.sketch_preview }
    screen.addView(preview, LinearLayout.LayoutParams(-1, 0, 1f).apply {
      topMargin = dp(8)
      bottomMargin = dp(8)
    })
    status = text("Выберите чертёж DXF или проект ATLANTA CAM.", 14).apply {
      id = R.id.status_message
      maxLines = 3
      ellipsize = TextUtils.TruncateAt.END
      accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
    }
    screen.addView(status)
    return screen
  }

  private fun text(value: String, size: Int, bold: Boolean = false): TextView = TextView(this).apply {
    text = value
    textSize = size.toFloat()
    setTextColor(Color.rgb(24, 42, 70))
    if (bold) typeface = Typeface.DEFAULT_BOLD
  }

  private fun dp(value: Int): Int = (resources.displayMetrics.density * value + 0.5f).toInt()

  private data class OpenedDocument(
    val uri: Uri,
    val name: String,
    val project: ProjectV5? = null,
    val drawing: DxfDrawing? = null,
  )

  private data class LoadedDocument(
    val document: OpenedDocument,
    val operation: ProjectOperation? = null,
    val scene: SketchScene? = null,
  )

  companion object {
    private const val OPEN_PROJECT = 1
    private const val STATE_URI = "projectUri"
    private const val STATE_OPERATION = "selectedOperation"
    private const val MAX_FILE_BYTES = 6_000_000
    private val DXF_SECTION = Regex("(?m)^[ \\t]*0[ \\t]*(?:\\r\\n|\\n|\\r)[ \\t]*SECTION[ \\t]*$")
  }
}
