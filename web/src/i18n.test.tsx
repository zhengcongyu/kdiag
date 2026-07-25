import {render, screen} from "@testing-library/react";
import {beforeEach, expect, test} from "vitest";
import {LanguageProvider, useLanguage} from "./i18n";

function Probe() {
  const {language, t, l, localize} = useLanguage();
  return <div><span>{language}</span><span>{t("accessTitle")}</span>
    <span>{t("unknown")}</span><span>{l("中文", "English")}</span><span>{localize("配置有效")}</span></div>;
}

beforeEach(() => localStorage.clear());

test("restores the English language preference", () => {
  localStorage.setItem("kdiag-language", "en");
  render(<LanguageProvider><Probe /></LanguageProvider>);
  expect(screen.getByText("en")).toBeInTheDocument();
  expect(screen.getByText("Kubernetes read access")).toBeInTheDocument();
  expect(screen.getByText("Unknown / Unverified")).toBeInTheDocument();
  expect(screen.getByText("Configuration valid")).toBeInTheDocument();
  expect(document.documentElement.lang).toBe("en");
});
