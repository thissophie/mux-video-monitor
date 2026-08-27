import { SSM } from '@aws-sdk/client-ssm';

interface LocalParameter {
  value: string;
  tags: Record<string, string>;
}

export type LocalParameters = Record<string, LocalParameter>;

const isStringRecord = (value: unknown): value is Record<string, string> =>
  value !== null &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.values(value).every((item) => typeof item === 'string');

export const parseLocalParameters = (source: string): LocalParameters => {
  const parsed = JSON.parse(source) as unknown;
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LOCAL_SSM_PARAMETERS must be a JSON object keyed by SSM parameter path');
  }

  return Object.entries(parsed).reduce<LocalParameters>((parameters, [name, parameter]) => {
    if (!name.startsWith('/multiview/mux/')) {
      throw new Error(`Local SSM parameter ${name} must be under /multiview/mux/`);
    }
    if (parameter === null || typeof parameter !== 'object' || Array.isArray(parameter)) {
      throw new Error(`Local SSM parameter ${name} must be an object`);
    }

    const { value, tags } = parameter as Record<string, unknown>;
    if (typeof value !== 'string' || !isStringRecord(tags)) {
      throw new Error(`Local SSM parameter ${name} must contain a string value and string tags`);
    }

    parameters[name] = { value, tags };
    return parameters;
  }, {});
};

export const makeLocalSSM = (parameters: LocalParameters): SSM =>
  ({
    getParameter: async ({ Name }: { Name?: string }) => {
      const parameter = Name === undefined ? undefined : parameters[Name];
      if (parameter === undefined) {
        throw new Error(`Parameter ${Name ?? '(missing name)'} not found`);
      }
      return { Parameter: { Name, Type: 'SecureString', Value: parameter.value } };
    },
    getParametersByPath: async ({ Path }: { Path?: string }) => ({
      Parameters: Object.keys(parameters)
        .filter((name) => Path !== undefined && name.startsWith(Path))
        .map((Name) => ({ Name, Type: 'SecureString' as const })),
    }),
    listTagsForResource: async ({ ResourceId }: { ResourceId?: string }) => {
      const parameter = ResourceId === undefined ? undefined : parameters[ResourceId];
      if (parameter === undefined) {
        const error = new Error(`Parameter ${ResourceId ?? '(missing resource ID)'} not found`);
        error.name = 'InvalidResourceId';
        throw error;
      }
      return {
        TagList: Object.entries(parameter.tags).map(([Key, Value]) => ({ Key, Value })),
      };
    },
  }) as unknown as SSM;
