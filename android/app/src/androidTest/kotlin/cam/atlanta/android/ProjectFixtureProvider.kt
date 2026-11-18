package cam.atlanta.android

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.FileNotFoundException
import org.json.JSONArray
import org.json.JSONObject

class ProjectFixtureProvider : ContentProvider() {
  override fun onCreate(): Boolean = true

  override fun getType(uri: Uri): String = "application/json"

  override fun query(
    uri: Uri,
    projection: Array<out String>?,
    selection: String?,
    selectionArgs: Array<out String>?,
    sortOrder: String?,
  ): Cursor {
    val name = fixtureName(uri)
    val columns = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME)
    return MatrixCursor(columns).apply {
      addRow(columns.map { column -> if (column == OpenableColumns.DISPLAY_NAME) name else null })
    }
  }

  override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
    if (mode != "r") throw FileNotFoundException("Read-only fixture")
    val name = fixtureName(uri)
    val assetName = if (name == MULTIPLE_OPERATIONS) "operation-project.json" else name
    val asset = checkNotNull(context).assets.open(assetName).use { it.readBytes() }
    val bytes = if (name == MULTIPLE_OPERATIONS) withDrillOperation(asset) else asset
    return openPipeHelper(uri, getType(uri), null, bytes) { output, _, _, _, contents ->
      ParcelFileDescriptor.AutoCloseOutputStream(output).use { it.write(contents) }
    }
  }

  override fun insert(uri: Uri, values: ContentValues?): Uri? =
    throw UnsupportedOperationException("Read-only fixture")

  override fun update(
    uri: Uri,
    values: ContentValues?,
    selection: String?,
    selectionArgs: Array<out String>?,
  ): Int = throw UnsupportedOperationException("Read-only fixture")

  override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int =
    throw UnsupportedOperationException("Read-only fixture")

  private fun fixtureName(uri: Uri): String {
    val name = uri.lastPathSegment
    if (uri.pathSegments.size != 1 || name == null || name !in FIXTURES) {
      throw FileNotFoundException("Unknown test fixture")
    }
    return name
  }

  private fun withDrillOperation(asset: ByteArray): ByteArray {
    val project = JSONObject(asset.toString(Charsets.UTF_8))
    project.getJSONArray("operations").put(
      JSONObject()
        .put("id", "o1")
        .put("kind", "drill")
        .put("color", "#2345a2"),
    )
    project.getJSONObject("sketch").getJSONArray("items").getJSONObject(0)
      .put("drillOps", JSONArray().put("o1"))
    return project.toString().toByteArray(Charsets.UTF_8)
  }

  companion object {
    const val AUTHORITY = "cam.atlanta.android.test.fixtures"
    const val MULTIPLE_OPERATIONS = "multiple-operations.json"
    private val FIXTURES = setOf("operation-project.json", "blank-project.json", "config.json", MULTIPLE_OPERATIONS)
  }
}
