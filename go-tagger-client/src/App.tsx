import { Router, Route } from "@solidjs/router";
import { GalleryPage } from "./pages/GalleryPage";
import { TrashPage } from "./pages/TrashPage";
import { UploadPage } from "./pages/UploadPage";
import "./App.css";

function App() {
  return (
    <Router>
      <Route path="/" component={GalleryPage} />
      <Route path="/trash" component={TrashPage} />
      <Route path="/upload" component={UploadPage} />
    </Router>
  );
}

export default App;
