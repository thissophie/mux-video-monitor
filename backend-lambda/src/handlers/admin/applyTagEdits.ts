import { SSM } from '@aws-sdk/client-ssm';
import { failure, Result, success } from '../../helpers/result';
import { TagEditPlan } from './AdminStream';

/**
 * SSM raises InvalidResourceId when the tag target does not exist — confirmed
 * against the declared exceptions for AddTagsToResource, RemoveTagsFromResource
 * and ListTagsForResource. It is not ParameterNotFound, which belongs to the
 * GetParameter family.
 */
export const isMissingParameterError = (err: Error): boolean => err.name === 'InvalidResourceId';

/**
 * Applies a plan with up to two SSM calls. Clearing a tag is a RemoveTagsFromResource
 * call, not an AddTagsToResource with an empty value.
 *
 * `plan.remove` is expected to have been filtered to keys that exist on the
 * parameter — see readRoomTags. Whether SSM treats removing an absent key as a
 * no-op is undocumented, so the caller does not rely on it either way.
 */
export const applyTagEdits = async (ssm: SSM, roomId: string, plan: TagEditPlan): Promise<Result<Error, void>> => {
  const ResourceId = `/multiview/mux/${roomId}`;

  const tags = Object.entries(plan.set).map(([Key, Value]) => ({ Key, Value }));

  try {
    if (tags.length > 0) {
      await ssm.addTagsToResource({ ResourceType: 'Parameter', ResourceId, Tags: tags });
    }

    if (plan.remove.length > 0) {
      await ssm.removeTagsFromResource({ ResourceType: 'Parameter', ResourceId, TagKeys: plan.remove });
    }
  } catch (err) {
    return failure(err as Error);
  }

  return success(undefined);
};
