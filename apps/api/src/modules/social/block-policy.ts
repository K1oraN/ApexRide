// Fixed SQL identifiers supplied only by server code.
export const notBlocked = (author: string, viewer = '$1') =>
  `NOT EXISTS(SELECT 1 FROM social_blocks b WHERE (b.blocker_id=${author} AND b.blocked_id=${viewer}::uuid) OR (b.blocked_id=${author} AND b.blocker_id=${viewer}::uuid))`;
