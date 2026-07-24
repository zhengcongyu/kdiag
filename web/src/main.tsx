import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {BrowserRouter} from "react-router-dom";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {createTheme, CssBaseline, ThemeProvider} from "@mui/material";
import {App} from "./App";
import "./styles.css";

const client = new QueryClient({defaultOptions: {queries: {retry: 1, staleTime: 10_000}}});
const theme = createTheme({
  palette: {
    mode: "light",
    primary: {main: "#007aff"},
    success: {main: "#1a9a49"},
    warning: {main: "#b66a00"},
    error: {main: "#d92d20"},
    background: {default: "#ffffff", paper: "#ffffff"},
    text: {primary: "#1d1d1f", secondary: "#6e6e73"},
    divider: "#e5e5ea"
  },
  shape: {borderRadius: 10},
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "Noto Sans SC", sans-serif',
    h4: {fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em"},
    h5: {fontSize: 22, fontWeight: 650, letterSpacing: "-0.015em"},
    h6: {fontSize: 17, fontWeight: 650},
    body1: {fontSize: 14, lineHeight: 1.55},
    body2: {fontSize: 13, lineHeight: 1.5},
    button: {textTransform: "none", fontWeight: 600}
  },
  components: {
    MuiButton: {styleOverrides: {root: {boxShadow: "none", minHeight: 34}}},
    MuiPaper: {styleOverrides: {root: {backgroundImage: "none"}}},
    MuiOutlinedInput: {styleOverrides: {root: {backgroundColor: "#fff"}}},
    MuiTooltip: {defaultProps: {arrow: true}}
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode><ThemeProvider theme={theme}><CssBaseline />
    <QueryClientProvider client={client}><BrowserRouter><App /></BrowserRouter></QueryClientProvider>
  </ThemeProvider></StrictMode>
);
