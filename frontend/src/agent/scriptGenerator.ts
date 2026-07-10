import { documentToScript } from "../persistence/documentPersistence";
import type { GeometryDocument } from "../types/geometry";

export interface ConstructionScriptGenerator {
  generate(document: GeometryDocument): string;
}

/** Adapter kept for assistant callers; documentToScript is the canonical serializer. */
export class GeometryDocumentScriptGenerator implements ConstructionScriptGenerator {
  generate(document: GeometryDocument): string {
    return documentToScript(document).trimEnd();
  }
}

export const scriptGenerator: ConstructionScriptGenerator = new GeometryDocumentScriptGenerator();
