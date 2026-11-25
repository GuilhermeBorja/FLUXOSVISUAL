import { createDomain as createSourceDomain, DomainError } from "../src/domain.mjs";
import { HttpError } from "./http.mjs";

export {
  checkId,
  clone,
  dateFields,
  dateValid,
  editableFields,
  id,
  operations,
  pick,
  same,
  evaluatePermission,
  validateState,
} from "../src/domain.mjs";

function toHttpError(error) {
  if (error instanceof HttpError) return error;
  if (error instanceof DomainError) {
    return new HttpError(error.status, error.code, error.message, error.details);
  }
  return error;
}

function translateErrors(operation) {
  return (...args) => {
    try {
      return operation(...args);
    } catch (error) {
      throw toHttpError(error);
    }
  };
}

export function createDomain(...args) {
  const domain = createSourceDomain(...args);
  return {
    ...domain,
    authorize: translateErrors(domain.authorize),
    item: translateErrors(domain.item),
    call: translateErrors(domain.call),
    forceItemId: translateErrors(domain.forceItemId),
  };
}
