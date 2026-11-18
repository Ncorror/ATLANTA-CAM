package cam.atlanta.android;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import android.util.Log;
import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Objects;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

// Android starts this provider in the separate test package, where only platform classes are available.
public class ProjectFixtureProvider extends ContentProvider {
  public static final String AUTHORITY = "cam.atlanta.android.test.fixtures";
  public static final String MULTIPLE_OPERATIONS = "multiple-operations.json";

  @Override
  public boolean onCreate() {
    return true;
  }

  @Override
  public String getType(Uri uri) {
    return "application/json";
  }

  @Override
  public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
    String name = fixtureName(uri);
    if (name == null) return null;
    String[] columns = projection == null ? new String[]{OpenableColumns.DISPLAY_NAME} : projection;
    MatrixCursor cursor = new MatrixCursor(columns);
    Object[] row = new Object[columns.length];
    for (int i = 0; i < columns.length; i++) {
      if (OpenableColumns.DISPLAY_NAME.equals(columns[i])) row[i] = name;
    }
    cursor.addRow(row);
    return cursor;
  }

  @Override
  public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    if (!"r".equals(mode)) throw new FileNotFoundException("Read-only fixture");
    String name = fixtureName(uri);
    if (name == null) throw new FileNotFoundException("Unknown test fixture");
    String assetName = MULTIPLE_OPERATIONS.equals(name) ? "operation-project.json" : name;
    byte[] contents;
    try (InputStream asset = Objects.requireNonNull(getContext()).getAssets().open(assetName)) {
      byte[] bytes = readAsset(asset);
      contents = MULTIPLE_OPERATIONS.equals(name) ? withDrillOperation(bytes) : bytes;
    } catch (IOException | JSONException error) {
      FileNotFoundException missing = new FileNotFoundException("Cannot read test fixture: " + name);
      missing.initCause(error);
      throw missing;
    }
    return openPipeHelper(uri, getType(uri), null, contents, (descriptor, source, type, options, bytes) -> {
      try (var output = new ParcelFileDescriptor.AutoCloseOutputStream(descriptor)) {
        output.write(bytes);
      } catch (IOException error) {
        Log.e("ProjectFixtureProvider", "Cannot write test fixture", error);
      }
    });
  }

  @Override
  public Uri insert(Uri uri, ContentValues values) {
    throw new UnsupportedOperationException("Read-only fixture");
  }

  @Override
  public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
    throw new UnsupportedOperationException("Read-only fixture");
  }

  @Override
  public int delete(Uri uri, String selection, String[] selectionArgs) {
    throw new UnsupportedOperationException("Read-only fixture");
  }

  private static String fixtureName(Uri uri) {
    String name = uri.getLastPathSegment();
    if (uri.getPathSegments().size() != 1 || name == null) return null;
    return switch (name) {
      case "operation-project.json", "blank-project.json", "config.json", MULTIPLE_OPERATIONS -> name;
      default -> null;
    };
  }

  private static byte[] readAsset(InputStream input) throws IOException {
    ByteArrayOutputStream output = new ByteArrayOutputStream();
    byte[] buffer = new byte[8192];
    for (int size; (size = input.read(buffer)) != -1;) {
      output.write(buffer, 0, size);
    }
    return output.toByteArray();
  }

  private static byte[] withDrillOperation(byte[] asset) throws JSONException {
    JSONObject project = new JSONObject(new String(asset, StandardCharsets.UTF_8));
    project.getJSONArray("operations").put(
      new JSONObject().put("id", "o1").put("kind", "drill").put("color", "#2345a2")
    );
    project.getJSONObject("sketch").getJSONArray("items").getJSONObject(0)
      .put("drillOps", new JSONArray().put("o1"));
    return project.toString().getBytes(StandardCharsets.UTF_8);
  }
}
