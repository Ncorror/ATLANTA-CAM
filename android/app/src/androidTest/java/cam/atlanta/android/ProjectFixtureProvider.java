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
  public static final String LAYERED_DXF = "layered-profile.dxf";
  public static final String INVALID_DXF = "broken-profile.dxf";
  public static final String EMBEDDED_DXF = "embedded-dxf-project.json";

  @Override
  public boolean onCreate() {
    return true;
  }

  @Override
  public String getType(Uri uri) {
    return LAYERED_DXF.equals(fixtureName(uri)) || INVALID_DXF.equals(fixtureName(uri))
      ? "image/vnd.dxf"
      : "application/json";
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
    byte[] contents;
    try {
      contents = fixtureContents(name);
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
      case LAYERED_DXF, INVALID_DXF, EMBEDDED_DXF -> name;
      default -> null;
    };
  }

  private byte[] fixtureContents(String name) throws IOException, JSONException {
    return switch (name) {
      case MULTIPLE_OPERATIONS -> withDrillOperation(readAsset("operation-project.json"));
      case INVALID_DXF -> "BROKEN\nSECTION\n".getBytes(StandardCharsets.UTF_8);
      case EMBEDDED_DXF -> embeddedDxf();
      default -> readAsset(name);
    };
  }

  private byte[] readAsset(String name) throws IOException {
    try (InputStream input = Objects.requireNonNull(getContext()).getAssets().open(name)) {
      ByteArrayOutputStream output = new ByteArrayOutputStream();
      byte[] buffer = new byte[8192];
      for (int size; (size = input.read(buffer)) != -1;) {
        output.write(buffer, 0, size);
      }
      return output.toByteArray();
    }
  }

  private byte[] embeddedDxf() throws IOException, JSONException {
    JSONObject project = new JSONObject(new String(readAsset("blank-project.json"), StandardCharsets.UTF_8));
    project.remove("sketch");
    project.put("rawDxf", new String(readAsset(LAYERED_DXF), StandardCharsets.UTF_8));
    project.put("dxfName", LAYERED_DXF);
    addOperation(project, "profile");
    return project.toString().getBytes(StandardCharsets.UTF_8);
  }

  private static byte[] withDrillOperation(byte[] asset) throws JSONException {
    JSONObject project = new JSONObject(new String(asset, StandardCharsets.UTF_8));
    addOperation(project, "drill");
    project.getJSONObject("sketch").getJSONArray("items").getJSONObject(0)
      .put("drillOps", new JSONArray().put("o1"));
    return project.toString().getBytes(StandardCharsets.UTF_8);
  }

  private static void addOperation(JSONObject project, String kind) throws JSONException {
    project.getJSONArray("operations").put(
      new JSONObject().put("id", "o1").put("kind", kind).put("color", "#2345a2")
    );
  }
}
