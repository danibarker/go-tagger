import { Router, Route } from "@solidjs/router";
import { GalleryPage } from "./pages/GalleryPage";
import "./App.css";

function App() {
  return (
    <Router>
      <Route path="/" component={GalleryPage} />
    </Router>
  );
}

export default App;
