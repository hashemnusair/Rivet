export class MemberProfileMissingError extends Error {
  constructor() {
    super("The authenticated member profile is not available.");
    this.name = "MemberProfileMissingError";
  }
}
