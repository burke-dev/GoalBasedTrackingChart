// input is the raw data and outputs the data as percentages
function getDataAsPercentage(goalArray, rawDataArray){
  const formattedData = getRawFormattedData(goalArray, rawDataArray);
  const valuesAsPercentage = getEntriesAsPercentageOfGoals(formattedData);

  return valuesAsPercentage;
}

// input is the raw data and outputs data in weekly intervals (Sundays)
function getFormattedData(goalArray, rawDataArray){
  const formattedData = getRawFormattedData(goalArray, rawDataArray);

  return formattedData.outputEntries;
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
  const outputEntries = convertBackToObject(headersAndEntriesObj);
  
  return { outputEntries, goalData };
}

// the object sent returned to the spreadsheet
function convertBackToObject(headersAndEntriesObj){
  return [headersAndEntriesObj.headers.map(header => header.title)]
    .concat(Object.keys(headersAndEntriesObj.entries)
      .map(objectKey => {
        let entryRow = headersAndEntriesObj.entries[objectKey];
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
          let key = goalRow[0].toLowerCase();
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

    let goalKeys = Object.keys(goal).map(x => x);
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
      
      let eKey = Object.keys(entries).map(key => key === getDateTitle(entryRow[0]) ? key : null ).filter(n => n)[0] ?? null;
      if(eKey === null){
        let values = {};
        entryRow.forEach((data, j) => {
          if(j !== 0){
            values[headers[j].hiddenTitle] = [data];
          }
        });
        const sunday = getSundayOfWeek(entryRow[0]);
        if(sunday !== null){
          const dateTitle = getDateTitle(sunday);
          entries[dateTitle] = {sunday, values};
        }
        return;
      }
      Object.keys(entries[eKey].values).forEach((valueKey, j) => {
        const entryValue = entryRow[j + 1] ?? '';
        if(entryValue !== ''){
          entries[eKey].values[valueKey].push(entryValue);
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
    Object.keys(entry.values).forEach(valuesKey => {
      entry.values[valuesKey] = pushPeakValueForWeek(entry.values[valuesKey], goalData[valuesKey]);
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
  if(Array.isArray(formattedData.outputEntries)){
    let headerKeys = [];
    return formattedData.outputEntries.map((entry, i) => {
      if(Array.isArray(entry)){
        return entry.map((data, j) => {
          // i === 0 => column header titles
          if(i === 0){
            headerKeys.push(formatHiddenTitle(data));
          }
          // j === 0 => row date
          if(i !== 0 && j !== 0){
            data = data ?? null;
            if(data === ''){
              return '';
            }
            if(data !== null){
              let goal = formattedData.goalData[headerKeys[j]];
              let start = convertValueToNumberByFormat(goal.format, goal.start);
              let end = convertValueToNumberByFormat(goal.format, goal.end);
              return (start - data)/(start - end);
            }
            return 0;
          }
          return data;
        });
      }
    });
  }
}

function getGoalDetails(goalData){
  let goals = {};
  Object.keys(goalData).forEach(key => {
    const goal = goalData[key];
    goals[key] = {
      format: goal.format,
      isDescending: getIsDescending(goal.format, goal.start, goal.end)
    };
  });
  return goals;
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
