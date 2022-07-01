function getSingleGoalProgressComparison(goalArray, rawDataArray, goalName){
  const goalKey = formatHiddenTitle(goalName);
  const formattedData = getRawFormattedData(goalArray, rawDataArray);
  const entries = formattedData.headersAndEntriesObj.entries;
  const singleGoal = getProgressAsObject(entries, formattedData.goalData, goalKey, goalName);

  return singleGoal;
}

function getProgressAsObject(entries, myGoal, goalKey, goalName){
  myGoal = myGoal[goalKey] ?? null;
  if(myGoal !== null){
    const totalEntries = Object.keys(entries).length - 1;
    return [[`${capitalizeEachTitleWord(goalName)} Projection`], ["Date", "Results", "Projection"]].concat(
      Object.keys(entries).map((_, i, entriesAsArray) => {
        return getSingleGoalProgressRow(entries, i, totalEntries, myGoal, goalKey, entriesAsArray);
      })
    );
  }
  return `Unknown Goal Value - ${goalName ?? "?"}`;
}

function getSingleGoalProgressRow(entries, i, totalEntries, myGoal, goalKey, entriesAsArray){
  const nextKey = entriesAsArray[i + 1] ?? null;
  const nextValue = nextKey !== null ? entries[nextKey].values[goalKey] : '';

  const entryKey = entriesAsArray[i];
  const entry = entries[entryKey];
  const start = convertValueToNumberByFormat(myGoal.format, myGoal.start);
  const end = convertValueToNumberByFormat(myGoal.format, myGoal.end);
  const value = entry.values[goalKey];
  const percentage = value !== '' ? (start - value)/(start - end) : '';
  const totalPercentage = nextValue === '' ?  i / totalEntries : '';
  return [entry.sunday, percentage, totalPercentage];
}

// input is the raw data and outputs the data as percentages
function getDataAsPercentage(goalArray, rawDataArray){
  const formattedData = getRawFormattedData(goalArray, rawDataArray);
  const headersAndEntriesObj = getEntriesAsPercentageOfGoals(formattedData);
  const outputEntries = convertBackToObject(headersAndEntriesObj);

  return outputEntries;
}

// input is the raw data and outputs data in weekly intervals (Sundays)
function getFormattedData(goalArray, rawDataArray){
  const formattedData = getRawFormattedData(goalArray, rawDataArray);
  const outputEntries = convertBackToObject(formattedData.headersAndEntriesObj);

  return outputEntries;
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

// these are internal functions and are not used by the users
function getRawFormattedData(goalArray, rawDataArray){
  const goalData = getGoalData(goalArray);
  const headersAndEntriesObj = getHeadersAndEntries(rawDataArray);
  const dateRange = getDateRange(goalData);
  peakOfEachValueByWeek(headersAndEntriesObj.entries, goalData);
  fillGapsInEntriesData(headersAndEntriesObj.entries, dateRange);
  fillSingleEmptyEntry(headersAndEntriesObj.entries);
  
  return { headersAndEntriesObj, goalData };
}

// the object sent returned to the spreadsheet
function convertBackToObject(headersAndEntriesObj){
  return [headersAndEntriesObj.headers.map(header => header.title)]
    .concat(Object.keys(headersAndEntriesObj.entries)
      .map(objectKey => {
        const entryRow = headersAndEntriesObj.entries[objectKey];
        let row = [];
        Object.keys(entryRow).forEach(entryKey => {
          let value = entryRow[entryKey];
          if(entryKey === 'sunday'){
            row.push(value);
          }
          if(entryKey === 'values'){
            Object.keys(entryRow[entryKey]).forEach(valueKey => {
              row.push(value[valueKey]);
            });
          }
        });
        if(isDateValid(row[0])){
          return row;
        }
      })
    );
  }

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

function getHeadersAndEntries(rawEntries){
  if(Array.isArray(rawEntries)){
    let headers = [];
    let entries = {};
    rawEntries.forEach((entryRow, i) => {
      if(i === 0){
        entryRow.forEach(title => {
          headers.push({ title, hiddenTitle: formatHiddenTitle(title) });
        });
        return;
      }
      
      const eKey = Object.keys(entries).map(key => key === getDateTitle(entryRow[0]) ? key : null ).filter(n => n)[0] ?? null;
      if(eKey === null){
        let rawValues = {};
        entryRow.forEach((data, j) => {
          if(j !== 0){
            rawValues[headers[j].hiddenTitle] = [data];
          }
        });
        const sunday = getSundayOfWeek(entryRow[0]);
        if(sunday !== null){
          const dateTitle = getDateTitle(sunday);
          entries[dateTitle] = {sunday, rawValues};
        }
        return;
      }
      Object.keys(entries[eKey].rawValues).forEach((valueKey, j) => {
        const entryValue = entryRow[j + 1] ?? '';
        if(entryValue !== ''){
          entries[eKey].rawValues[valueKey].push(entryValue);
        }
      });
    });
    return { headers, entries };
  }
}

function getDateTitle(date){
  if(isDateValid(date)){
    let options = { year: '2-digit', month: '2-digit', day: '2-digit' };
    date = getSundayOfWeek(date).toLocaleDateString("en-US", options);
    let splitDate = date.split("/");
    return `${splitDate[2]}-${splitDate[0]}-${splitDate[1]}`;
  }
  return null;
}

function peakOfEachValueByWeek(entries, goalData){
  Object.keys(entries).forEach(entriesKey => {
    let entry = entries[entriesKey];
    entries[entriesKey].values = {};
    Object.keys(entry.rawValues).forEach(valuesKey => {
      entry.values[valuesKey] = pushPeakValueForWeek(entry.rawValues[valuesKey], goalData[valuesKey]);
    });
  });
}

//gets the range of all the entries to fill in any gaps for the output data
function getDateRange(goalData){
  let currentDate = goalData.dateData.start;
  const emptyValues = {};
  Object.keys(goalData).forEach(key => { emptyValues[key] = ""; });

  let range = {
    [getDateTitle(currentDate)]: { sunday: currentDate, values: emptyValues }
  };
  while(new Date(currentDate) < new Date(goalData.dateData.end)){
    let tempDate = new Date(currentDate.valueOf());
    tempDate.setDate(tempDate.getDate() + 7);
    currentDate = tempDate;
    range[getDateTitle(currentDate)] = { sunday: currentDate, values: emptyValues };
  }
  return range;
}

function fillGapsInEntriesData(entries, dateRange){
  Object.keys(dateRange).forEach(date => {
    const entriesDoesNotContainThisDate = !(entries[date] ?? false);
    if(entriesDoesNotContainThisDate){
      entries[date] = dateRange[date];
    }
  });
}

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

function getEntriesAsPercentageOfGoals(formattedData){
  Object.keys(formattedData.headersAndEntriesObj.entries).forEach(entriesKey => {
    let entries = formattedData.headersAndEntriesObj.entries[entriesKey];
    Object.keys(entries.values).forEach((key, j) => {
      let goalData = formattedData.goalData[key];
      let value = entries.values[key];
      if(value != ''){
        let start = convertValueToNumberByFormat(goalData.format, goalData.start);
        let end = convertValueToNumberByFormat(goalData.format, goalData.end);
        formattedData.headersAndEntriesObj.entries[entriesKey].values[key] = (start - value)/(start - end);
      }
    });
  });
  return formattedData.headersAndEntriesObj;
}

function pushPeakValueForWeek(allValues, goalDetails){
  let removedEmptyValues = allValues.sort().filter(n => n !== null || n !== '');
  if(removedEmptyValues.length === 0){
    return "";
  }
  if(removedEmptyValues.length === 1){
    return convertValueToNumberByFormat(goalDetails.format, removedEmptyValues[0]);
  }
  const sortedValues = goalDetails.isDescending
    ? removedEmptyValues
    : removedEmptyValues.reverse();
  return convertValueToNumberByFormat(goalDetails.format, sortedValues[0]);
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
  return str
    .replace(/[^\w\s]/gi, '')                 // remove special characters
    .replace(/\s(.)/g, a => a.toUpperCase())  // capitalize the first letter of each word
    .replace(/\s/g, '')                       // remove spaces
    .replace(/^(.)/, b => b.toLowerCase());   // set first letter to lower case
}

function capitalizeEachTitleWord(rawString){
  return rawString.split(' ').map(value => {
    return value.split('').map((v, i) => i === 0 ? v.toUpperCase() : v.toLowerCase() ).join('');
  }).join(' ');
}

function getValueByFormat(format, value){
  if(format ?? false){
    return format === 'date' ? getSundayOfWeek(value) : value;
  }
  return null;
}

// input "Raw Title" => output "rawTitleData"
const formatHiddenTitle = (str) => `${getCamelCase(str)}Data`;
const slashedDate = (date) => isDateValid(date) ? new Date(date).toLocaleDateString("en-US") : null;
const isDateValid = (date) => getCamelCase(`${new Date(date)}`) !== 'invalidDate';
const getValueIfEmpty = (prev, next) => (prev !== "" && next !== "") ? (prev + next) / 2 : "";
const isRowNotEmpty = (str) => getCamelCase(str) !== '';
