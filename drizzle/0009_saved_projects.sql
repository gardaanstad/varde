-- Opening a project now keeps its read state; saving is the explicit choice.
-- Projects followed before become saved, and unfollowed ones stay unsaved.
ALTER TABLE `bookmark` RENAME COLUMN `following` TO `saved`;
