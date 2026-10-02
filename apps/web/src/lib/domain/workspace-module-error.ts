import type { ErrorMessageDescriptor } from "../i18n/error-messages";

export class WorkspaceModuleError extends Error {
  constructor(message: string, readonly messageDescriptor: ErrorMessageDescriptor) {
    super(message);
    this.name = "WorkspaceModuleError";
  }
}

export function workspaceModuleErrorMessage(error: unknown): ErrorMessageDescriptor | undefined {
  return error instanceof WorkspaceModuleError ? error.messageDescriptor : undefined;
}
