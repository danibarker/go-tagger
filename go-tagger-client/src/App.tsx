import { Router, Route } from "@solidjs/router";
import { GalleryPage } from "./pages/GalleryPage";
import { UploadPage } from "./pages/UploadPage";
import "./App.css";

function App() {
  return (
    <Router>
      <Route path="/" component={GalleryPage} />
      <Route path="/upload" component={UploadPage} />
    </Router>
  );
}

export default App;
