import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {BrowserRouter} from "react-router-dom";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {createTheme, CssBaseline, ThemeProvider} from "@mui/material";
import {App} from "./App";

const client = new QueryClient({defaultOptions: {queries: {retry: 1, staleTime: 10_000}}});
const theme = createTheme({
  palette: {mode: "light", primary: {main: "#1455a3"}, background: {default: "#f5f7fa"}},
  typography: {fontFamily: '"Inter", "Noto Sans SC", system-ui, sans-serif'}
});

createRoot(document.getElementById("root")!).render(
  <StrictMode><ThemeProvider theme={theme}><CssBaseline />
    <QueryClientProvider client={client}><BrowserRouter><App /></BrowserRouter></QueryClientProvider>
  </ThemeProvider></StrictMode>
);

