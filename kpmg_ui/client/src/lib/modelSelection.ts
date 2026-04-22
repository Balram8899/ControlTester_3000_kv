export interface SelectableModel {
  value: string;
  label?: string;
}

export function resolveSelectedModel(
  storedModel: string | null | undefined,
  availableModels: SelectableModel[] | undefined,
): string {
  const normalizedStoredModel = storedModel?.trim() ?? "";
  const availableValues = (availableModels ?? [])
    .map((model) => model.value?.trim() ?? "")
    .filter(Boolean);

  if (availableValues.length === 0) {
    return normalizedStoredModel;
  }

  if (normalizedStoredModel && availableValues.includes(normalizedStoredModel)) {
    return normalizedStoredModel;
  }

  return availableValues[0];
}
