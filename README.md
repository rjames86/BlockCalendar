# Install

This script reads from the local Calendar.app database. You'll need to have all of your calendars added and synced for this to work.

Install icalBuddy

    brew install ical-buddy

Update path to `icalBuddy` in the script. To confirm the path, run `which icalBuddy` and update the variable called `icalBuddyPath`.

Set the calendars to read and write to. To get the UIDs of your calendars, you can run the following command

    icalBuddy calendars

The `readID` and `writeID` can be the same thing if you want. I had originally made it so that you could write to a separate calendar so you could hide it and keep your calendar clean. Seems, though, that Google Calendar ignores separate calendars when people schedule with you, so this might be pointless now.

# Configuration

These are the variables you can update

- `blockedEventName`
    - Be careful with what you name this. You'll want it to be something unique, otherwise events could get removed that you didn't intend to
- `daysToRead`
    - How many days out you want the script to look.
- `icalBuddyPath`
    - see installation instructions


# Running Script

    osascript block_calendar.js