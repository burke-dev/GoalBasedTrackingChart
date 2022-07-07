['use strict']

// input is the raw data and outputs the data as percentages
function getDataAsPercentage(goalArray, rawDataArray){
  const formattedData = getRawFormattedData(goalArray, rawDataArray);
  const allEntries = getEntriesAsPercentageOfGoals(formattedData);
  const outputEntries = convertBackToObject(allEntries);

  return outputEntries;
}

// input is the raw data and outputs data in weekly intervals (Sundays)
function getFormattedData(goalArray, rawDataArray){
  const formattedData = getRawFormattedData(goalArray, rawDataArray);
  const outputEntries = convertBackToObject(formattedData.allEntries);

  return outputEntries;
}

// input is same as the others, but adds the param for a single goal -- to chart the progress being made and projecting the results to the end date
function getSingleGoalProgressComparison(goalArray, rawDataArray, goalName){
  const formattedData = getRawFormattedData(goalArray, rawDataArray, goalName);
  const singleGoal = getProgressAsObject(formattedData.allEntries.dateRange, formattedData.goalData, goalName);

  return singleGoal;
}

// used for debugging - it converts the raw data in the spreadsheet into an array of arrays - paste into the empty array of "rawDataArray"
function formatRawDataForExport(rawDataArray){
  // an empty row of data appended to the end of the arrays
  const emptyRow = rawDataArray[0].map(_ => '""').join(',');
  return rawDataArray.map(row => {
    const joinedRowEntries = String(row).split(",").map(entry => `"${entry}"`).join(',');
    return `[${joinedRowEntries}],`
  }).filter(n => isRowNotEmpty(n)).concat(`[${emptyRow}]`);
}

// the rest are internal functions and are not used by the users

// converts the raw data from the spreadsheet to a usable form
function getRawFormattedData(goalArray, rawDataArray, goalName){
  const goalData = getGoalData(goalArray);
  const allEntries = getHeadersAndDateRange(goalData, rawDataArray, goalName);
  peakOfEachValueByWeek(allEntries.dateRange, goalData);
  fillSingleEmptyEntry(allEntries.dateRange);
  
  return { allEntries, goalData };
}

// the object sent returned to the spreadsheet
function convertBackToObject(allEntries){
  return [allEntries.headers.map(header => header.title)]
    .concat(Object.keys(allEntries.dateRange)
      .map(objectKey => {
        const entryRow = allEntries.dateRange[objectKey];
        let row = [entryRow.sunday];
        Object.keys(entryRow.values).forEach(entryKey => {
          if(entryKey !== 'dateData'){
            row.push(entryRow.values[entryKey]);
          }
        });
        return isDateValid(row[0]) ? row : null;
      }).filter(n => n)
    );
  }

// converts to users goals into a usable object
function getGoalData(goalArray){
  if(Array.isArray(goalArray)){
    let goals = {};
    let hiddenTitles = [];

    goalArray[0].forEach(title => {
      const hiddenTitle = formatHiddenTitle(title);
      goals[hiddenTitle] = { title };
      hiddenTitles.push(hiddenTitle);
    });

    goalArray.forEach((goalRow, i) => {
      if(Array.isArray(goalRow)){
        if(i !== 0){
          const key = getCamelCase(goalRow[0]);
          goalRow.forEach((q, j) => {
            if(q !== '' && j !== 0){
              goals[hiddenTitles[j]][key] = key === 'format' ? q.toLowerCase() : q;
            }
          });
        }
      }
    });
    filterGoals(goals);

    return goals;
  }
}

// removes goal values from consideration if there is no start or end goals and determines whether the goal is > or < than the start => isDescending
function filterGoals(goals){
  Object.keys(goals).forEach(key => {
    const goal = goals[key];

    const goalKeys = Object.keys(goal).map(x => x);
    if(!goalKeys.includes('start') || !goalKeys.includes('end')){
      delete goals[key];
      return;
    }

    const start = getValueByFormat(goal.format, goal.start);
    const end = getValueByFormat(goal.format, goal.goal);
    goals[key].isDescending = getIsDescending(goal.format, start, end);
  });
}

function getHeadersAndDateRange(goalData, rawEntries, goalName){
  if(Array.isArray(rawEntries)){
    let headers = [];
    let dateRange = {};
    getAllDates(goalData, goalName).forEach(date => {dateRange[getDateTitle(date)] = { sunday: date, values: {}, rawValues: {} }});
    rawEntries.forEach((entryRow, i) => {
      entryRow.forEach((data, j) => {
        if(i === 0){
          let hiddenTitle = formatHiddenTitle(data);
          headers.push({ title: data, hiddenTitle });
          Object.keys(dateRange).forEach(key => {
            dateRange[key].values[hiddenTitle] = ''
            dateRange[key].rawValues[hiddenTitle] = []
          });
          return;
        }
        if(j !== 0 && data !== ''){
          let sunday = getSundayOfWeek(entryRow[0]);
          if(dateRange[getDateTitle(sunday)] ?? false){
            dateRange[getDateTitle(sunday)].rawValues[headers[j].hiddenTitle].push(data);
          }
        }
      });
    });

    return { headers, dateRange };
  }
}

function getDateTitle(date){
  if(isDateValid(date)){
    const options = { year: '2-digit', month: '2-digit', day: '2-digit' };
    const splitDate = getSundayOfWeek(date).toLocaleDateString("en-US", options).split("/");
    return `${splitDate[2]}-${splitDate[0]}-${splitDate[1]}`;
  }
  return null;
}

//returns the "best" value for each week: low for isDescending, high for !isDescending
function peakOfEachValueByWeek(dateRange, goalData){
  Object.keys(dateRange).forEach(entriesKey => {
    let entry = dateRange[entriesKey];
    Object.keys(entry.rawValues).forEach(valuesKey => {
      entry.values[valuesKey] = pushPeakValueForWeek(entry.rawValues[valuesKey], goalData[valuesKey]);
    });
  });
}

//gets the range of all the entries from start to goal
function getAllDates(goalData, goalName){
  let currentDate = new Date(goalData.dateData.start);
  let dateRange = [currentDate];
  const end = getSpecialEnd(goalData, goalName) ?? goalData.dateData.end;
  while(new Date(currentDate) < new Date(end)){
    let tempDate = new Date(currentDate.valueOf());
    tempDate.setDate(tempDate.getDate() + 7);
    currentDate = tempDate;
    dateRange.push(currentDate);
  }
  return dateRange;
}

function getSpecialEnd(goalData, goalName){
  try {
    let hiddenTitle = formatHiddenTitle(goalName) ?? false;
    return goalData[hiddenTitle].specialEndDate ?? null;
  } catch {
    return null;
  }
}

// returns the average value between two valid values -- if weight in week[3] === '' and (week[2] == 200 && week[4] === 205) it will return week[3] === 202.5 but only if [2] and [4] are valid
function fillSingleEmptyEntry(entries){
  let allKeys = Object.keys(entries);
  allKeys.forEach((entryKey, i) => {
    let lastEntry = Object.keys(entries).length - 1;
    if(i > 0 && i < lastEntry){
      Object.keys(entries[entryKey].values).forEach(valueKey => {
        if(entries[entryKey].values[valueKey] === ''){
          let prev = entries[allKeys[i - 1]].values[valueKey];
          let next = entries[allKeys[i + 1]].values[valueKey];
          entries[entryKey].values[valueKey] = getValueIfEmpty(prev, next);
        }
      });
    }
  });
}

// returns the data as a percentage of the goal as opposed to the raw results
function getEntriesAsPercentageOfGoals(formattedData){
  Object.keys(formattedData.allEntries.dateRange).forEach(entriesKey => {
    let entries = formattedData.allEntries.dateRange[entriesKey].values;
    Object.keys(entries).forEach(key => {
      let goalData = formattedData.goalData[key];
      let value = entries[key];
      if(value != ''){
        let start = convertValueToNumberByFormat(goalData.format, goalData.start);
        let end = convertValueToNumberByFormat(goalData.format, goalData.end);
        formattedData.allEntries.dateRange[entriesKey].values[key] = (start - value)/(start - end);
      }
    });
  });
  return formattedData.allEntries;
}

// determines and returns the "best" value for each entry
function pushPeakValueForWeek(allValues, goalDetails){
  if(allValues.length === 0){
    return "";
  }
  if(allValues.length === 1){
    return convertValueToNumberByFormat(goalDetails.format, allValues[0]);
  }
  const sortedValues = goalDetails.isDescending
    ? allValues
    : allValues.reverse();
  return convertValueToNumberByFormat(goalDetails.format, sortedValues[0]);
}

function getProgressAsObject(entries, myGoal, goalName){
  const goalKey = formatHiddenTitle(goalName);
  myGoal = myGoal[goalKey] ?? null;
  if(myGoal !== null){
    let tempObj = fillAllCentralEmptyValues(entries, goalKey);
    return [[`${capitalizeEachTitleWord(goalName)} Projection`], ["Date", "Results", "Projection"]].concat(
      Object.keys(entries)
        .map(key => { return { date: entries[key].sunday, value: entries[key].values[goalKey] }})
        .map((entry, i) => {
          let val = i < tempObj.lumpedValues.length - 1 ? tempObj.lumpedValues[i]: entry;
          return getSingleGoalProgressRow(val, i, tempObj.details, myGoal);
        })
    );
  }
  return `Unknown Goal Value - ${goalName ?? "?"}`;
}

function getSingleGoalProgressRow(val, i, details, myGoal){
  const start = convertValueToNumberByFormat(myGoal.format, myGoal.start);
  const end = convertValueToNumberByFormat(myGoal.format, myGoal.end);
  let percentage = val.value !== '' ? (start - val.value)/(start - end) : '';
  percentage = percentage >= 0 ? percentage : 0;
  const totalPercentage = i >= details.lastIndex ?  i / details.totalEntries : '';
  return [val.date, percentage, totalPercentage];
}

// fills all the empty values within a set of filled values
// still very clunky and can be optimized
function fillAllCentralEmptyValues(entries, goalKey){
    const lastIndex = getLastIndex(entries, goalKey);
    let lumpedValues = Object.keys(entries)
      .map((key, i) => { return {i, date: entries[key].sunday, value: entries[key].values[goalKey]}})
      .sort((a, b) => a.date - b.date).filter(a => a.i <= lastIndex)
      .map((entry, i, allEntries) => {
        if(i === 0){
          if(entry.value === ''){
            entry.value = 0;
          }
          return entry;
        }
        if(entry.value !== ''){
          return entry;
        }
        let previous = allEntries[i - 1];
        let next = getNextValidValue(allEntries, i);
        if(previous.value === '' || next.value === ''){
          return entry;
        }
        let steps = next.i - previous.i;
        let diff = next.value - previous.value - 1;
        for(let z = 1; z < steps; z++){
          let bIndex = previous.i + z;
          let add = z * diff / steps;
          allEntries[bIndex].value = previous.value + add;
        }
        return entry;
      });
    const totalEntries = Object.keys(entries).length - 1;
    return { lumpedValues, details: {lastIndex , totalEntries} };
}

const getLastIndex = (entries, goalKey) => {
  return Object.keys(entries)
    .map((key, i) => entries[key].values[goalKey] !== '' ? [entries[key].sunday, i] : null)
    .filter(n => n).sort((a, b) => b[0] - a[0])[0][1];
}

function getNextValidValue(all, i){
  let z = i;
  let nextValue = all[++z].value;
  const lastIndex = all.length - 1;
  while(nextValue === ''){
    if(z > lastIndex){
      break;
    }
    nextValue = all[++z].value;
  }
  return all[z];
}

function getSundayOfWeek(rawDate){
  if(isDateValid(rawDate)){
    const date = new Date(rawDate);
    const setToSunday = date.getDate() - date.getDay();
    return new Date(date.setDate(setToSunday));
  }
  return null;
}

// if the goal start value > end then it isDescending -- if it is true, then the lowest value will be used for the weekly results
function getIsDescending(format, start, end){
  if(format === 'date' || format === 'time'){
    return new Date(start) > new Date(end);
  }
  if(format === 'number'){
    return Number(start) > Number(end);
  }
  console.log(`Unknown format -> ${format ?? ''} // start ${start ?? ''} // end ${end ?? ''}`);
  return false;
}

function convertValueToNumberByFormat(format, value){
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
    console.log(`Unknown format -> ${format} // value ${value}`);
  }
  return '';
}

function getCamelCase(str){
  return (str ?? '')
    .replace(/[^\w\s]/gi, '')                 // remove special characters
    .replace(/\s(.)/g, a => a.toUpperCase())  // capitalize the first letter of each word
    .replace(/\s/g, '')                       // remove spaces
    .replace(/^(.)/, b => b.toLowerCase());   // set first letter to lower case
}

function capitalizeEachTitleWord(rawString){
  return rawString.split(' ').map(value => {
    return value.toLowerCase().split('').map((v, i) => i === 0 ? v.toUpperCase() : v ).join('');
  }).join(' ');
}

function getValueByFormat(format, value){
  if(format ?? false){
    return format === 'date' ? getSundayOfWeek(value) : value;
  }
  return null;
}

// input "Raw Title" => output "rawTitleData"
const formatHiddenTitle = (str) => str.length ? `${getCamelCase(str)}Data` : null;
const slashedDate = (date) => isDateValid(date) ? new Date(date).toLocaleDateString("en-US") : null;
const isDateValid = (date) => getCamelCase(`${new Date(date)}`) !== 'invalidDate';
const getValueIfEmpty = (prev, next) => (prev !== "" && next !== "") ? (prev + next) / 2 : "";
const isRowNotEmpty = (str) => getCamelCase(str) !== '';
