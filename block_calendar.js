#!/usr/bin/env osascript -l JavaScript

/*
To reset permissions for Calendars and Reminders
tccutil reset Calendar
tccutil reset Reminders
**/

var app = Application.currentApplication();
app.includeStandardAdditions = true;
var Calendar = Application("Calendar");

var computerName = app.doShellScript("/usr/sbin/scutil --get ComputerName");
var blockedEventName = "DNB - Busy";
var icalBuddyPath = computerName === "kvothe"
  ? "/usr/local/bin/icalBuddy"
  : "/opt/homebrew/bin/icalBuddy";
var daysToRead = 7;

/* 
ReadIDs are the calendars to read events from
Write IDs can be the same (although hasn't been tested), but
I generally create a separate calendar for the DNB events 
to keep things cleaner

To find the UIDs of your calendars, run the command
  icalBuddy calendars
**/
var default_calendarDatas = [
  {
    name: "M",
    readID: "BB1DB51E-8D73-4CA6-ACF1-DF0449BD0225",
    writeID: "BB1DB51E-8D73-4CA6-ACF1-DF0449BD0225",
  },
  {
    name: "NC",
    readID: "425D3423-00A4-465F-A9A2-C7F832EC11BC",
    writeID: "425D3423-00A4-465F-A9A2-C7F832EC11BC",
  },
  {
    name: "Personal",
    readID: "7FBF2BEE-5877-4390-BE2A-C303E5B5A9AC",
    writeID: null,
  },
];

var kvothe_calendarDatas = [
  {
    name: "M",
    readID: "733BEB1C-1396-42DC-8AAC-CA88EF0242B6",
    writeID: "733BEB1C-1396-42DC-8AAC-CA88EF0242B6",
  },
  {
    name: "NC",
    readID: "3A5C2904-F669-4058-B08B-ABF65AFCF3E8",
    writeID: "3A5C2904-F669-4058-B08B-ABF65AFCF3E8",
  },
  {
    name: "Personal",
    readID: "D9AF6C5E-6AA6-4B40-ABBB-806052E0B0EA",
    writeID: null,
  },
];

var calendarDatas =
  computerName === "kvothe" ? kvothe_calendarDatas : default_calendarDatas;

function formatDateString(d) {
  var month = d.getMonth() + 1;
  var day = d.getDate();
  var hour = d.getHours();
  var minute = d.getMinutes();
  var second = d.getSeconds();

  var year = d.getFullYear();
  var paddedMonth = month < 10 ? "0" + month : month;
  var paddedDay = day < 10 ? "0" + day : day;
  var paddedHour = hour < 10 ? "0" + hour : hour;
  var paddedMinute = minute < 10 ? "0" + minute : minute;
  var paddedSecond = second < 10 ? "0" + second : second;

  var timezoneOffset = d.getTimezoneOffset();
  var currentTimezone = (timezoneOffset / 60) * -1;
  var offset = "";
  if (currentTimezone !== 0) {
    offset += currentTimezone > 0 ? "+" : "-";
    var hour = Math.abs(currentTimezone);
    offset += hour < 10 ? "0" : "";
    offset += hour;
    offset += "00";
  }

  // YYYY-MM-DD HH:MM:SS +HHMM
  return `${year}-${paddedMonth}-${paddedDay} ${paddedHour}:${paddedMinute}:${paddedSecond} ${offset}`;
}

function getWriteIDs(excludeID) {
  var writeIDs = calendarDatas
    .map((c) => c.writeID)
    .filter((id) => id !== null);
  if (excludeID != null) {
    return writeIDs.filter((id) => id !== excludeID);
  }
  return writeIDs;
}

function calliCalBuddy(calendarID, ...rest) {
  var command = [
    icalBuddyPath,
    `-ic '${calendarID}'`,
    "-nrd", // no relative dates
    "-npn", // no property names
    "-nc", // no calendar names
    "-iep 'title,datetime'", // include event properties
    "-ps ' | '", // property separators
    "-po 'uid,datetime,title'", // property order
    "-df '%Y-%m-%d'", // date format
    "-tf '%H:%M:%S%z'", // time format
    "-b ''", // bullet point
    // "-n", // include only events from now on
    "-ea", // exclude all day events
    "-uid", // include UID for event
    ...rest,
  ].join(" ");
  return app.doShellScript(command);
}

function getRawCalendarData(readID) {
  return calliCalBuddy(readID, `eventsToday+${daysToRead}`);
}

function getEventsForDateRange(calendarID, from, to) {
  var fromISOString = formatDateString(from);
  var toISOString = formatDateString(to);
  return calliCalBuddy(
    calendarID,
    `eventsFrom:'${fromISOString}'`,
    `to:'${toISOString}'`
  );
}

function parseEvents(rawData, excludeBlocks = true) {
  return rawData.split("\r").map((eventString) => {
    var [uid, startToEnd, summary] = eventString.split("|");
    var [date, startEndTime] = startToEnd.split(" at ");
    var [startTimeWithTZ, endTimeWithTZ] = startEndTime.split(" - ");

    var eventStart = new Date(`${date}T${startTimeWithTZ}`);
    var eventEnd = new Date(`${date}T${endTimeWithTZ}`);

    return {
      summary,
      uid,
      eventStart,
      eventEnd,
    };
  }).filter(({ summary }) => {
    if (excludeBlocks === true) {
      return summary !== blockedEventName;
    } else {
      return true;
    }
  });
}

function hasExistingEvent(calendarID, start, end, comparator) {
  var maybeEventExists = getEventsForDateRange(calendarID, start, end);

  if (maybeEventExists.length === 0) {
    return false;
  }

  var parsedMaybeEventExists = parseEvents(maybeEventExists, false);
  return parsedMaybeEventExists.some(
    (element) =>
      element.eventStart.getTime() === start.getTime() &&
      element.eventEnd.getTime() === end.getTime() &&
      comparator(element)
  );
}

/* 
  This is a stupid hack.
  Apparently the UID that gets returned from Applescript is a "local UID" whereas
  iCalBuddy and most other applications return the shared UID. We have to query
  the Calendar.app cache to find that UID
**/
function sqlQuery(calendarID, sharedUID) {
  var quotedForm = (s) => "'" + s.replace(/'/g, "'\\''") + "'";

  var libraryFolderPath = app
    .pathTo("library folder", { from: "user domain" })
    .toString();
  var sqlitePath = `${libraryFolderPath}/Calendars/Calendar Cache`;
  var query = `
    SELECT DISTINCT
        ZLOCALUID as localID
    FROM 
        zcalendaritem
    JOIN 
        znode
    ON 
        znode.z_pk = zcalendaritem.zcalendar
        AND zcalendaritem.zshareduid = '${sharedUID}'
        AND znode.zuid = '${calendarID}'
  `;
  return app.doShellScript(
    `echo ${quotedForm(query)} | sqlite3 ${quotedForm(sqlitePath)}`
  );
}

console.log("Running on", computerName);
function addCalendarBlocks() {
  for (let calendarData of calendarDatas) {
    var { readID, writeID } = calendarData;
    var rawEventData = getRawCalendarData(readID);

    if (rawEventData.length === 0) {
      continue;
    }

    var parsedEvents = parseEvents(rawEventData);

    var writeIDs = getWriteIDs(writeID);
    writeIDs.forEach((writeID) => {
      parsedEvents.forEach((parsedEvent) => {
        var existingEvent = hasExistingEvent(
          writeID,
          parsedEvent.eventStart,
          parsedEvent.eventEnd,
          (element) => element.summary === blockedEventName
        );
        console.log("do we have a match?", existingEvent);

        if (!existingEvent) {
          var cal = Calendar.calendars.byId(writeID);
          var event = Calendar.Event({
            summary: blockedEventName,
            startDate: parsedEvent.eventStart,
            endDate: parsedEvent.eventEnd,
          });
          cal.events.push(event);
        }
      });
    });
  }
}

function checkOrphanedEvents() {
  // We now check for any orphaned events. Maybe an event got cancelled and we need to open that time slot back up.
  var allWriteIDs = getWriteIDs();
  var allReadIDs = calendarDatas
    .map((c) => c.readID)
    .filter((id) => id !== null);
  getWriteIDs().forEach((writeID) => {
    var dnbEventsRaw = getRawCalendarData(writeID);
    var dnbEvents = parseEvents(dnbEventsRaw, false);
    dnbEvents.forEach((e) => {
      var existingEvent = hasExistingEvent(
        allReadIDs.join(","),
        e.eventStart,
        e.eventEnd,
        (element) => element.summary !== blockedEventName
      );
      console.log('existing event?', JSON.stringify(e, null, 2), existingEvent)
      if (!existingEvent) {
        var localUID = sqlQuery(writeID, e.uid);
        var cal = Calendar.calendars.byId(writeID);
        var event = cal.events.byId(localUID);
        event.delete();
      }
    });
  });
}

function main() {
  addCalendarBlocks();
  checkOrphanedEvents();
}

main();
