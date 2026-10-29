import java.io.*;
import java.nio.file.*;
import org.apache.commons.scxml2.io.*;
import org.apache.commons.scxml2.model.*;

public class Probe {
  public static void main(String[] a) throws Exception {
    String in = a[0];
    SCXML m = SCXMLReader.read(new FileInputStream(in));
    System.out.println("loaded: initial=" + m.getInitial() + " states=" + m.getChildren().size());
    for (TransitionTarget t : m.getChildren()) {
      System.out.println("  state " + t.getId() + " transitions=" + (t instanceof State ? ((State) t).getTransitionsList().size() : -1));
    }
    String out = SCXMLWriter.write(m);
    Files.writeString(Path.of(a[1]), out);
    System.out.println("serialized bytes=" + out.length() + " contains 'rb:'? " + out.contains("rb:") + " contains 'urn:reebeat'? " + out.contains("urn:reebeat"));
  }
}
