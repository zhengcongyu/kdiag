import {render, screen} from "@testing-library/react";
import {beforeEach, expect, test} from "vitest";
import {LanguageProvider, useLanguage} from "./i18n";

function Probe() {
  const {language, t} = useLanguage();
  return <div><span>{language}</span><span>{t("accessTitle")}</span><span>{t("observed")}</span></div>;
}

beforeEach(() => localStorage.clear());

test("restores the English language preference", () => {
  localStorage.setItem("kdiag-language", "en");
  render(<LanguageProvider><Probe /></LanguageProvider>);
  expect(screen.getByText("en")).toBeInTheDocument();
  expect(screen.getByText("Kubernetes read access")).toBeInTheDocument();
  expect(screen.getByText("Observed")).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("en");
});
