"use strict";

// used for debugging - it converts the raw data in the spreadsheet into an array of arrays - paste into the empty array of "rawDataArray"
function RawData(rawDataArray){
  // an empty row of data appended to the end of the arrays
  const emptyRow = rawDataArray[0].map(_ => '""').join(',');
  return rawDataArray.map(row => {
    const joinedRowEntries = String(row).split(",").map(entry => `"${entry}"`).join(',');
    return `[${joinedRowEntries}],`
  }).filter(row => _isRowNotEmpty(row)).concat(`[${emptyRow}]`);
}

// input is the raw data and outputs the data as percentages
function Percentage(rawDataArray, goalArray){
  const formattedData = _getRawFormattedData(rawDataArray, goalArray, []);
  const dataAsPercentage = _getEntriesAsPercentageOfGoals(formattedData.allEntries, formattedData.goalData);
  const percentageAsArray = _convertDataBackToArrays(dataAsPercentage, 'Percentage Of Each Goal Reached');
  return percentageAsArray;
}

// input is the raw data and outputs data in weekly intervals (Sundays)
function Formatted(rawDataArray, goalArray){
  const formattedData = _getRawFormattedData(rawDataArray, goalArray, []);
  const formattedAsArray = _convertDataBackToArrays(formattedData.allEntries, 'Goals Grouped in Weekly Amounts');
  return formattedAsArray;
}

// input is same as the others, but adds the param for a single goal -- to chart the progress being made and projecting the results to the end date
function GoalProgress(rawDataArray, goalArray, goalName){
  const formattedData = _getRawFormattedData(rawDataArray, goalArray, [goalName]);
  const progressAsArray = _getSingleGoalProgressComparison(formattedData.allEntries.dateRanges, formattedData.goalData, [goalName]);
  return progressAsArray[0];
}

// the rest are internal functions and are not used by the users
// converts the raw data from the spreadsheet to a usable form
function _getRawFormattedData(rawDataArray, goalArray, goalNames){
  const goalData = _getGoalData(goalArray);
  const validGoalNames = goalNames.filter(goalName => goalName && goalName.length);
  const allEntries = _getHeadersAndDateRanges(goalData, rawDataArray, validGoalNames);
  _peakOfEachValueByWeek(allEntries.dateRanges, goalData);
  _fillSingleEmptyEntry(allEntries.dateRanges);
  _fillSpecialObjectsWithPeakValues(allEntries.dateRanges);

  return { allEntries, goalData };
}

// input is same as the others, but adds the param for a single goal -- to chart the progress being made and projecting the results to the end date
function _getSingleGoalProgressComparison(dateRanges, goalData, goalNames){
  return goalNames.map(goalName => {
    const goalKey = _formatHiddenTitle(goalName);
    const myGoal = goalData[goalKey] ?? false;
    const dateRange = dateRanges[goalKey] ?? false;
    return myGoal && dateRange ? _getGoalOutputArray(goalName, myGoal, dateRange) : [`Problem with Goal - ${goalName}`];
  }).filter(n => n);
}

function _getGoalOutputArray(goalName, myGoal, dateRange){
  const entriesWithValues = _fillAllCentralEmptyValues(dateRange);
  const lumpedValues = entriesWithValues.lumpedValues;
  const lastEntry = (_ => {
    let lastI = Math.max(...lumpedValues.map(x => x.i));
    return lumpedValues.filter(x => x.i === lastI)[0]
  })();
  return [
    [`${_capitalizeEachTitleWord(goalName)} Projection`],
    ["Date", "Results", "Projection"]
  ].concat(Object.keys(dateRange)
    .map(key => {
      return {
        "date": dateRange[key].sunday,
        "value": dateRange[key].value
      }
    })
    .map((projectedValue, i) => {
      let graphEntry = i < lumpedValues.length - 1 ? lumpedValues[i]: projectedValue;
      return _getSingleGoalProgressRow(graphEntry, i, entriesWithValues.details, myGoal, lastEntry);
    })
  );
}

// the object sent returned to the spreadsheet
function _convertDataBackToArrays(allEntries, title){
  const fullTime = allEntries.dateRanges.fullTime;
  return [[title], allEntries.headers.map(header => header.title)]
    .concat(Object.keys(fullTime)
      .map(objectKey => {
        const entryRow = fullTime[objectKey];
        let row = [entryRow.sunday];
        Object.keys(entryRow.values).forEach(entryKey => {
          if(entryKey !== 'dateData'){
            row.push(entryRow.values[entryKey]);
          }
        });
        return _isDateValid(row[0]) ? row : null;
      })
      .filter(n => n)
    );
}

// converts to users goals into a usable object
function _getGoalData(goalArray){
  if(Array.isArray(goalArray)){
    let goals = {};
    let hiddenTitles = [];
    goalArray.forEach((goalRow, i) => {
      if(Array.isArray(goalRow)){
        if(i === 0){
          const tempObj = _getGoalsAndHiddenTitles(goalRow);
          goals = tempObj.goals;
          hiddenTitles = tempObj.hiddenTitles;
          return;
        }
        const key = _getCamelCase(goalRow[0]) ?? '';
        if(key !== ''){
          goalRow.forEach((rowEntry, j) => {
            if(j !== 0){
              goals[hiddenTitles[j]][key] = key === 'format' ? rowEntry.toLowerCase() : rowEntry;
            }
          });
        }
      }
    });
    _filterGoals(goals);

    return goals;
  }
}

function _getGoalsAndHiddenTitles(goalRow){
  let goals = {};
  let hiddenTitles = goalRow.map(title => {
    const hiddenTitle = _formatHiddenTitle(title);
    goals[hiddenTitle] = { title };
    return hiddenTitle;
  });
  return { goals, hiddenTitles };
}

// removes goal values from consideration if there is no start or end goals and determines whether the goal is > or < than the start => isDescending
function _filterGoals(goals){
  Object.keys(goals).forEach(key => {
    const goal = goals[key];

    const goalKeys = Object.keys(goal).map(x => x);
    if(!goalKeys.includes('start') || !goalKeys.includes('end')){
      delete goals[key];
      return;
    }

    const start = _getValueByFormat(goal.format, goal.start);
    const end = _getValueByFormat(goal.format, goal.goal);
    goals[key].isDescending = _getIsDescending(goal.format, start, end);
  });
}

function _getHeadersAndDateRanges(goalData, rawEntries, goalNames){
  if(Array.isArray(rawEntries)){
    let headers = [];
    let dateRanges = _getFullTimeDateRanges(goalData, goalNames);
    rawEntries.forEach((entryRow, i) => {
      entryRow.forEach((data, j) => {
        if(i === 0){
          const hiddenTitle = _formatHiddenTitle(data);
          headers.push({ title: data, hiddenTitle });
          Object.keys(dateRanges.fullTime).forEach(key => {
            dateRanges.fullTime[key].values[hiddenTitle] = ''
            dateRanges.fullTime[key].rawValues[hiddenTitle] = []
          });
          return;
        }
        if(j !== 0 && data !== ''){
          const sunday = _getSundayOfWeek(entryRow[0]);
          let sundayTitle = _getDateTitle(sunday);
          if(dateRanges.fullTime[sundayTitle] ?? false){
            dateRanges.fullTime[sundayTitle].rawValues[headers[j].hiddenTitle].push(data);
          }
        }
      });
    });

    return { headers, dateRanges };
  }
}

//gets the range of all the entries from start to goal
function _getFullTimeDateRanges(goalData, goalNames){
  const dateRanges = _getSpecialEnds(goalData, goalNames);

  let currentDate = (_ => {
    const startDateMidnight = new Date(goalData.dateData.start).setHours(0,0,0,0);
    return new Date(startDateMidnight);
  })();
  let isoDate = _formatDate(currentDate);
  const end = dateRanges.fullTime.end;
  dateRanges.fullTime = { [_getDateTitle(currentDate)]: _addDateEntry(currentDate) };
  while( _sundayIsLessThanEndDate(isoDate, end) ){
    currentDate = (_ => {
      let tempDate = new Date(currentDate.valueOf());
      tempDate.setDate(tempDate.getDate() + 7);
      return tempDate;
    })();
    isoDate = _formatDate(currentDate);
    dateRanges.fullTime[_getDateTitle(currentDate)] = _addDateEntry(currentDate);
  }

  return dateRanges;
}

function _formatDate(start){
  let tempDate = new Date(start);
  new Date(tempDate).setHours(0,0,0,0);
  return tempDate.toISOString();
}

function _getSpecialEnds(goalData, goalNames){
    let outputObj = {
      "fullTime": {
        "end": goalData.dateData.end
      }
    }
    if(goalNames.length){
      outputObj.end = {};
      goalNames.forEach(goalName => {
        const myGoal = (_ => {
          const hiddenTitle = _formatHiddenTitle(goalName);
          return goalData[hiddenTitle] ?? false;
        })();
        if(myGoal){
          const specialEnd = myGoal.specialEndDate;
          const goalEnd = _getCamelCase(goalName);
          outputObj.end[goalEnd] = _isDateValid(specialEnd) ? specialEnd : goalData.dateData.end;
        }
      });
    }
    return outputObj;
}

// some times Google Sheets will add an hour to the date and cause the comparison to fail on the last date
const _sundayIsLessThanEndDate = (currentDate, endDate) => {
  const current = new Date(currentDate).toISOString();
  const end = new Date(endDate).toISOString();
  return new Date(current) <= new Date(end);
};

function _getDateTitle(date){
  if(_isDateValid(date)){
    const options = { year: '2-digit', month: '2-digit', day: '2-digit' };
    const splitDate = _getSundayOfWeek(date).toLocaleDateString("en-US", options).split("/");
    return `${splitDate[2]}-${splitDate[0]}-${splitDate[1]}`;
  }
  return null;
}

//returns the "best" value for each week: low for isDescending, high for !isDescending
function _peakOfEachValueByWeek(dateRanges, goalData){
  Object.keys(dateRanges.fullTime).forEach(entriesKey => {
    const entry = dateRanges.fullTime[entriesKey];
    Object.keys(dateRanges.fullTime[entriesKey].values).forEach(vKey => {
      entry.values[vKey] = _pushPeakValueForWeek(entry.rawValues[vKey], goalData[vKey]);
    });
  });
}

// returns the average value between two valid values -- if weight in week[3] === '' and (week[2] == 200 && week[4] === 205) it will return week[3] === 202.5 but only if [2] and [4] are valid
function _fillSingleEmptyEntry(entries){
  const allKeys = Object.keys(entries.fullTime);
  const lastEntry = allKeys.length - 1;
  allKeys.forEach((_, i) => {
    if(i > 0 && i < lastEntry){
      let fullTime = entries.fullTime[allKeys[i]].values;
      Object.keys(fullTime).forEach(valueKey => {
        if(fullTime[valueKey] === ''){
          const prev = entries.fullTime[allKeys[i - 1]].values[valueKey];
          const next = entries.fullTime[allKeys[i + 1]].values[valueKey];
          fullTime[valueKey] = _getValueIfEmpty(prev, next);
        }
      });
    }
  });
}

function _fillSpecialObjectsWithPeakValues(dateRanges){
  if(dateRanges.end){
    Object.keys(dateRanges.end).forEach(key => {
      const hiddenTitle = _formatHiddenTitle(key);
      dateRanges[hiddenTitle] = {};
      Object.keys(dateRanges.fullTime).forEach(date => {
        const fullTime = dateRanges.fullTime[date];
        const sunday = fullTime.sunday;
        if(_sundayIsLessThanEndDate(sunday, dateRanges.end[key])){
          dateRanges[hiddenTitle][_getDateTitle(sunday)] = { sunday, value: fullTime.values[hiddenTitle] };
        }
      });
    });
    delete dateRanges.end;
  }
}

// returns the data as a percentage of the goal as opposed to the raw results
function _getEntriesAsPercentageOfGoals(allEntries, goals){
  Object.keys(allEntries.dateRanges).forEach(key => {
    let dateRange = allEntries.dateRanges[key];
    Object.keys(dateRange).forEach(entriesKey => {
      const entries = dateRange[entriesKey].values ?? {};
      Object.keys(entries).forEach(key => {
        const goalData = goals[key];
        const value = entries[key];
        if(value != ''){
          dateRange[entriesKey].values[key] = _getPercentage(goalData.start, goalData.end, value, goalData.format);
        }
      });
    });
  });
  return allEntries;
}

// determines and returns the "best" value for each entry
function _pushPeakValueForWeek(allValues, goalDetails){
  if(allValues.length === 0){
    return "";
  }
  if(allValues.length === 1){
    return _convertValueToNumberByFormat(goalDetails.format, allValues[0]);
  }
  const sortedValues = goalDetails.isDescending
    ? allValues
    : allValues.reverse();
  return _convertValueToNumberByFormat(goalDetails.format, sortedValues[0]);
}

function _getSingleGoalProgressRow(graphEntry, i, details, myGoal, lastEntry){
  const percentage = (_ => {
    if(graphEntry.value !== ''){
      const currentValue = _convertValueToNumberByFormat(myGoal.format, graphEntry.value);
      const outputPercentage = _getPercentage(myGoal.start, myGoal.end, currentValue, myGoal.format);
      return outputPercentage > 0 ? outputPercentage : 0;
    }
    return '';
  })();

  const totalPercentage = (_ => {
    if(i >= details.lastIndex){
      const lastValue = _convertValueToNumberByFormat(myGoal.format, lastEntry.value);
      const lastEntryPercentage = _getPercentage(myGoal.start, myGoal.end, lastValue, myGoal.format);
      const addPercentage = (lastEntryPercentage / lastEntry.i) * (i - details.lastIndex);
      return lastEntryPercentage + addPercentage;
    }
    return '';
  })();

  return [graphEntry.date, percentage, totalPercentage];
}

function _getPercentage(goalStart, goalEnd, currentValue, format){
  const start = _convertValueToNumberByFormat(format, goalStart);
  const end = _convertValueToNumberByFormat(format, goalEnd);
  const value = _convertValueToNumberByFormat(format, currentValue);
  return (start - value) / (start - end);
}

// fills all the empty values within a set of filled values
// still very clunky and can be optimized
function _fillAllCentralEmptyValues(entries){
  const lastIndex = _getLastIndex(entries);
  const lumpedValues = Object.keys(entries)
    .map((key, i) => {
      return { i, date: entries[key].sunday, value: entries[key].value }
    })
    .sort((a, b) => a.date - b.date)
    .filter(a => a.i <= lastIndex)
    .map((entry, i, allEntries) => _fillFilteredEmptyValues(entry, i, allEntries));
  const totalEntries = Object.keys(entries).length - 1;
  return { lumpedValues, details: {lastIndex , totalEntries} };
}

function _fillFilteredEmptyValues(entry, i, allEntries){
  if(i === 0 && entry.value === ''){
    entry.value = 0;
  }
  if(entry.value !== ''){
    return entry;
  }
  let previous = allEntries[i - 1];
  let nextValid = _getNextValidValue(allEntries, i);
  if(previous.value === '' || nextValid.value === ''){
    return entry;
  }
  const steps = nextValid.i - previous.i;
  const diff = nextValid.value - previous.value - 1;
  for(let z = 1; z < steps; z++){
    const bIndex = previous.i + z;
    const add = z * diff / steps;
    allEntries[bIndex].value = previous.value + add;
  }
  return entry;
}

function _getLastIndex(entries){
  return Object.keys(entries)
    .map((key, i) => entries[key].value !== '' ? [entries[key].sunday, i] : null)
    .filter(n => n).sort((a, b) => b[0] - a[0])[0][1];
}

function _getNextValidValue(all, i){
  let localIndex = i;
  const lastIndex = all.length - 1;
  if(lastIndex > localIndex){
    let nextValue = all[++localIndex].value;
    while(nextValue === ''){
      if(localIndex === lastIndex){
        break;
      }
      nextValue = all[++localIndex].value;
    }
  }
  return all[localIndex];
}

function _getSundayOfWeek(rawDate){
  if(_isDateValid(rawDate)){
    const date = new Date(rawDate);
    const dateSetToSunday = date.getDate() - date.getDay();
    return new Date(date.setDate(dateSetToSunday));
  }
  return null;
}

// if the goal start value > end then it isDescending -- if it is true, then the lowest value will be used for the weekly results
function _getIsDescending(format, start, end){
  if(format === 'date' || format === 'time'){
    return new Date(start) > new Date(end);
  }
  if(format === 'number'){
    return Number(start) > Number(end);
  }
  console.warn(`Unknown format -> ${format ?? ''} // start ${start ?? ''} // end ${end ?? ''}`);
  return false;
}

function _convertValueToNumberByFormat(format, value){
  if(value !== ''){
    // Google Sheets stores Times as "Sat Dec 30 1899 00:36:36 GMT-0600 (GMT-06:00)" +- however much time is being passed in
    if(format === 'time'){
      const valueDate = new Date(value);
      const minutes = (valueDate.getHours() * 60) + valueDate.getMinutes() - 36;
      const seconds = valueDate.getSeconds() - 36;
      return minutes + seconds / 60;
    }
    if(format === 'number'){
      return Number(value);
    }
    console.error(`Unknown format -> ${format} // value ${value}`);
  }
  return '';
}

function _getCamelCase(str){
  if(typeof str !== 'string'){
    console.error(`_getCamelCase() error - str must be typeof string not -> ${(typeof str)} - ${str}`);
    return '';
  }
  return str
    .replace(/[^\w\s]/gi, '')                 // remove special characters
    .replace(/\s(.)/g, a => a.toUpperCase())  // capitalize the first letter of each word
    .replace(/\s/g, '')                       // remove spaces
    .replace(/^(.)/, b => b.toLowerCase());   // set first letter to lower case
}

function _capitalizeEachTitleWord(rawString) {
  if(typeof rawString !== 'string'){
    console.error(`_capitalizeEachTitleWord() error - str must be typeof string not -> ${(typeof rawString)} - ${rawString}`);
    return '';
  }
  return rawString
    .split(' ')
    .map(value => value.toLowerCase().split('').map((v, i) => i === 0 ? v.toUpperCase() : v ).join(''))
    .join(' ');
}

function _getValueByFormat(format, value){
  if(format ?? false){
    return format === 'date' ? _getSundayOfWeek(value) : value;
  }
  return null;
}

// input "Raw Title" => output "rawTitleData"
const _formatHiddenTitle = (str) => str.length ? `${_getCamelCase(str)}Data` : null;
const _isDateValid = (date) => _getCamelCase(`${new Date(date)}`) !== 'invalidDate';
const _getValueIfEmpty = (prev, next) => (prev !== "" && next !== "") ? (prev + next) / 2 : "";
const _addDateEntry = (currentDate) => { return { "sunday": currentDate, "values": {}, "rawValues": {} } };
const _isRowNotEmpty = (str) => _getCamelCase(str) !== '';
