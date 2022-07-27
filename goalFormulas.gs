// used for debugging - it converts the raw data in the spreadsheet into an array of arrays - paste into the empty array of "rawDataArray"
function RawData(rawDataArray){
  return rawDataArray;
}

// input is the raw data and outputs the data as percentages
function Percentage(rawDataArray, goalArray){
  const formattedData = _getRawFormattedData(rawDataArray, goalArray, []);
  const allData = _getEntriesAsPercentageOfGoals(formattedData.allEntries, formattedData.goalData);
  const getPercentage = _convertDataBackToArrays(allData);
  return getPercentage;
}

// input is the raw data and outputs data in weekly intervals (Sundays)
function Formatted(rawDataArray, goalArray){
  const formattedData = _getRawFormattedData(rawDataArray, goalArray, []);
  const getFormatted = _convertDataBackToArrays(formattedData.allEntries);
  return getFormatted;
}

// input is same as the others, but adds the param for a single goal -- to chart the progress being made and projecting the results to the end date
function GoalProgress(rawDataArray, goalArray, special){
  const formattedData = _getRawFormattedData(rawDataArray, goalArray, [special]);
  const getProgress = _getSingleGoalProgressComparison(formattedData.allEntries.dateRanges, formattedData.goalData, [special]);
  return getProgress[0];
}

// converts the raw data from the spreadsheet to a usable form
function _getRawFormattedData(rawDataArray, goalArray, specials){
  const goalData = _getGoalData(goalArray);
  const allEntries = _getHeadersAndDateRanges(goalData, rawDataArray, specials);
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
    if(myGoal){
      let dateRange = dateRanges[goalKey] ?? false;
      if(!dateRange){
        return;
      }
      let tempObj = _fillAllCentralEmptyValues(dateRange);
      return [
          [`${_capitalizeEachTitleWord(goalName)} Projection`], 
          ["Date", "Results", "Projection"]
        ].concat(Object.keys(dateRange)
          .map(key => {
            return {
              date: dateRange[key].sunday,
              value: dateRange[key].value
            }
          })
          .map((entry, i) => {
            const val = i < tempObj.lumpedValues.length - 1 ? tempObj.lumpedValues[i]: entry;
            return _getSingleGoalProgressRow(val, i, tempObj.details, myGoal);
          })
        );
    }
    console.error(`Unknown Goal Value - ${goalName ?? "?"}`);
    return null;
  }).filter(n => n);
}

// the rest are internal functions and are not used by the users

// the object sent returned to the spreadsheet
function _convertDataBackToArrays(allEntries){
  const fullTime = allEntries.dateRanges.fullTime;
  return [allEntries.headers.map(header => header.title)]
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

function _getHeadersAndDateRanges(goalData, rawEntries, specials){
  if(Array.isArray(rawEntries)){
    let headers = [];
    let dateRanges = _getFullTimeDateRanges(goalData, specials);
    rawEntries.forEach((entryRow, i) => {
      entryRow.forEach((data, j) => {
        if(i === 0){
          const hiddenTitle = _formatHiddenTitle(data);
          headers.push({ title: data, hiddenTitle });
          Object.keys(dateRanges.fullTime).forEach(rangesKey => {
            dateRanges.fullTime[rangesKey].values[hiddenTitle] = ''
            dateRanges.fullTime[rangesKey].rawValues[hiddenTitle] = []
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
function _getFullTimeDateRanges(goalData, specials){
  specials = specials.filter(special => special && special.length);
  const dateRanges = _getSpecialEnds(goalData, specials);
  
  const startDateMidnight = new Date(goalData.dateData.start).setHours(0,0,0,0);
  let currentDate = new Date(startDateMidnight);
  let tempDates = { [_getDateTitle(currentDate)]: _addDateEntry(currentDate) };
  while( _sundayIsLessThanEndDate(currentDate, dateRanges.fullTime.end) ){
    let tempDate = new Date(currentDate.valueOf());
    tempDate.setDate(tempDate.getDate() + 7);
    currentDate = tempDate;
    tempDates[_getDateTitle(currentDate)] = _addDateEntry(currentDate);
  }
  dateRanges.fullTime = tempDates;

  return dateRanges;
}

function _getSpecialEnds(goalData, specialNames){
    let outputObj = {
      "fullTime": {
        "end": goalData.dateData.end
      }
    }
    if(specialNames.length){
      outputObj.end = {};
      specialNames.forEach(goalName => {
        const hiddenTitle = _formatHiddenTitle(goalName);
        const specialEnd = goalData[hiddenTitle].specialEndDate;
        const goalEnd = _getCamelCase(goalName);
        outputObj.end[goalEnd] = _isDateValid(specialEnd) ? specialEnd : goalData.dateData.end;
      });
    }
    return outputObj;
}

const _sundayIsLessThanEndDate = (currentDate, endDate) => {
  // some times Google Sheets will add an hour to the date and cause the comparison to fail on the last date
  let current = _slashedDate(currentDate);
  let end = _slashedDate(endDate);
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
    let entry = dateRanges.fullTime[entriesKey];
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
          let prev = entries.fullTime[allKeys[i - 1]].values[valueKey];
          let next = entries.fullTime[allKeys[i + 1]].values[valueKey];
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
          const start = _convertValueToNumberByFormat(goalData.format, goalData.start);
          const end = _convertValueToNumberByFormat(goalData.format, goalData.end);
          dateRange[entriesKey].values[key] = (start - value)/(start - end);
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

function _getSingleGoalProgressRow(val, i, details, myGoal){
  const start = _convertValueToNumberByFormat(myGoal.format, myGoal.start);
  const end = _convertValueToNumberByFormat(myGoal.format, myGoal.end);
  let percentage = val.value !== '' ? (start - val.value)/(start - end) : '';
  percentage = percentage >= 0 ? percentage : 0;
  const totalPercentage = i >= details.lastIndex ?  i / details.totalEntries : '';
  return [val.date, percentage, totalPercentage];
}

// fills all the empty values within a set of filled values
// still very clunky and can be optimized
function _fillAllCentralEmptyValues(entries){
  const lastIndex = _getLastIndex(entries);
  let lumpedValues = Object.keys(entries)
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
  let steps = nextValid.i - previous.i;
  let diff = nextValid.value - previous.value - 1;
  for(let z = 1; z < steps; z++){
    let bIndex = previous.i + z;
    let add = z * diff / steps;
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

const _slashedDate = (date) => _getSundayOfWeek(date).toLocaleDateString("en-US");

const _getValueIfEmpty = (prev, next) => (prev !== "" && next !== "") ? (prev + next) / 2 : "";

const _addDateEntry = (currentDate) => { return { "sunday": currentDate, "values": {}, "rawValues": {} } };
