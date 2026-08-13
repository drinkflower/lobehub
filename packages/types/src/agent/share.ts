import type { ShareVisibility } from '../topic';

/** Agent metadata exposed to signed-in visitors of an agent share. */
export interface SharedAgentData {
  agentId: string;
  agentMeta: {
    avatar: string | null;
    backgroundColor: string | null;
    description: string | null;
    marketIdentifier: string | null;
    name: string | null;
    slug: string | null;
    title: string | null;
  };
  shareId: string;
  visibility: ShareVisibility;
}
