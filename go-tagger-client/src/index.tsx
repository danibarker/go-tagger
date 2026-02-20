/* @refresh reload */
import { render } from "solid-js/web";
import "./index.css";
import App from "./App.tsx";
import { ToastProvider } from "./components/ToastProvider";

const root = document.getElementById("root");

render(
  () => (
    <ToastProvider>
      <App />
    </ToastProvider>
  ),
  root!,
);
