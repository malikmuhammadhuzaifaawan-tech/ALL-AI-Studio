// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { getSavedActiveId, useChatStore } from "@/store/chat-store";

describe("chat selection persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useChatStore.setState({ activeId: null, messages: [] });
  });

  it("remembers the selected conversation across reloads", () => {
    useChatStore.getState().setActiveId("conversation-123");

    expect(getSavedActiveId()).toBe("conversation-123");
  });

  it("remembers an explicitly selected new conversation", () => {
    useChatStore.getState().setActiveId("conversation-123");
    useChatStore.getState().reset();

    expect(getSavedActiveId()).toBeNull();
    expect(useChatStore.getState().messages).toEqual([]);
  });
});
