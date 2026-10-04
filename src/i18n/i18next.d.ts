import "i18next";
import type fr from "./fr";

declare module "i18next" {
  interface CustomTypeOptions {
    resources: { translation: typeof fr };
  }
}
