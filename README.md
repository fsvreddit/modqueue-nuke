# Modqueue Nuke

Modqueue Nuke is an app that allows subreddit moderators to bulk remove items from the modqueue based on a set of
criteria. This is useful for subreddits that want to remove a large number of items at once, such as spam,
rule-breaking, or other unwanted content.

## Usage

To use Modqueue Nuke, you must have the `posts` permission. You can access the app by navigating to the main page of
your subreddit and finding "Nuke Modqueue" in the subreddit context menu.

Next, you will see a dialog box where you can select the criteria for the items you want to remove. Note: Modqueue Nuke
will only remove items that match **ALL** selected criteria. You can filter by:

- **Item Type**: Comments, submissions, or both. Defaults to both (All).
- **Maximum Score**: Maximum score of the item. Items with a score lower than this will be removed.
- **Minimum Age**: Minimum age of the item in hours. Items older than this will be removed.
- **Minimum Reports**: Minimum number of reports on the item. Items with greater than or equal to this number of reports
  will be removed.
- **Title and Body Keyword/Phrase Filter**: Keywords to search for in the item's title or body. Items that contain any
  of these keywords will be removed. Keywords are case-insensitive.
    - **Use Regex?**: If enabled, interpret the text in "Keywords and/or Phrases" as Regular Expression. For
      example, `no\s+(yo)?u` would match any item with "no" followed by either "you" or "u" with one or more spaces or
      new lines between them.
    - Each keyword or phrase you want to match must be on separate lines.
- **Report Reason Keyword/Phrase Filter**: Keywords to search for in the item's report reasons. Items that contain any
  of these keywords will be removed. Keywords are case-insensitive.
    - **Ignore User Reports?**: If enabled, only check reports made by subreddit moderators.
    - **Use Regex?**: If enabled, interpret the text in "Report Keywords and/or Phrases" as Regular Expression. For
      example, `no\s+(yo)?u` would match any item with "no" followed by either "you" or "u" with one or more spaces or
      new lines between them.
    - Each keyword or phrase you want to match must be on separate lines.
- **Ignore Sticky Posts**: If enabled, items that are stickied/pinned will not be removed.
- **Ignore Moderator Items**: If enabled, items that are made by moderators or distinguished will not be removed.
- **Ignore Visible Items**: If enabled, items that are visible to users will not be removed. (i.e., not filtered by
  u/AutoModerator or removed by Reddit's spam filters).
- **Ignore Previously Approved Items**: If enabled, items that have been previously approved by a moderator will not be
  removed.
- **Re-Approve Previously Approved Items**: If enabled, items that have been previously approved by a moderator will be
  re-approved instead.
- **Modqueue Scan Limit**: The maximum number of items to scan in the modqueue. Default is 0. Set to 0 to scan as many
  items as possible items.

## Known Issues

- The "Ignore Visible Items" toggle is not perfect and will err on the side of caution. It is possible that some items
  that are not visible to users are not removed. If this happens contact my author, u/Lil_SpazJoekp.
    - Comments that have been filtered by AutoModerator will not be removed by Modqueue Nuke when utilizing the "Ignore
      Visible Items" filter. This is due to Modqueue Nuke not able to access the necessary data to determine if a
      comment has been filtered by AutoModerator. Posts that have been filtered are not affected by this limitation. A
      fix for this should be in the works by Reddit.
- Sometimes Modqueue Nuke will not catch all items in the modqueue. This is likely due to Reddit's API limitations and
  is out of the control of Modqueue Nuke. If this happens, try running the nuke again or contact my author,
  u/Lil_SpazJoekp, if you need additional assistance.

## Feedback

If you have any feedback or suggestions for Modqueue Nuke, file a bug report or feature request on
the [GitHub page](https://github.com/LilSpazJoekp/Modqueue-Nuke).

## Changes

### 1.3.2

- Add option to remove modqueued comments on posts when the post is removed or locked (configured in settings)

### 1.3.1

- Update devvit version for vulnerability fix.

### 1.3.0

- Optimized nuking process to be faster and more efficient.
- Fixed an issue with the "Ignore Reports" toggle not working correctly.
- Fixed an issue with approving previously approved would also ignore reports even if the "Ignore Reports" toggle was
  off.

### 1.2.0

- Added the ability to limit the number of items when scanning the modqueue.

### 1.1.5

- Fixed an issue with nuking large modqueues taking too long to complete.

### 1.1.2

- No changes, just updating the README.

### 1.1.1

- No changes, just updating the README.

### 1.1.0

- Set the default for "Item Type" to 'All'
- Added a check to verify if the invoker has `post` or `all` permissions before nuking.
- Added "Re-Approve Previously Approved Items" toggle to re-approve items that have been previously approved.
- Added "Ignore Reports" toggle to set "ignore reports" on previously approved items.
- Added the ability to filter items by keywords, phrases, and regular expressions in the items' title, body, and report
  reason.

### 1.0.0

- Initial release.
