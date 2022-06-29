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
  let emptyRow;
  return rawDataArray.map((row, i) => {
    const allEntries = String(row).split(",").map(entry => `"${entry}"`);
    if(i == 0){
      emptyRow = allEntries.map(_ => `""`);
    }
    const rowIsNotEmpty = allEntries.filter(n => n != '\"\"').join('') != '';
    return rowIsNotEmpty
      ? `[${allEntries.join(',')}],`
      : null;
  }).filter(n => n).concat(`[${emptyRow.join(',')}]`);
}

// these are internal functions and are not used by the users
function getRawFormattedData(goalArray, rawDataArray){
  const goalData = getGoalData(goalArray);
  const headersAndEntriesObj = getHeadersAndEntries(rawDataArray);
  const dateRange = getDateRange(headersAndEntriesObj.entries, goalData);
  peakOfEachValueByWeek(headersAndEntriesObj.entries, goalData);
  fillGapsInEntriesData(headersAndEntriesObj.entries, dateRange);
  fillSingleEmptyEntry(headersAndEntriesObj.entries);
  const outputEntries = convertBackToObject(headersAndEntriesObj);
  
  return { outputEntries, goalData };
}

function convertBackToObject(headersAndEntriesObj){
  return [headersAndEntriesObj.headers.map(header => header.title)].concat(Object.keys(headersAndEntriesObj.entries).map(key => {
    let entry = headersAndEntriesObj.entries[key];
    let row = [];
    Object.keys(entry).forEach(e => {
      if(e == 'sunday'){
        row.push(slashedDate(entry[e]));
      }
      if(e == 'values'){
        Object.keys(entry[e]).forEach(z => {
          row.push(entry[e][z]);
        });
      }
    });
    return row;
  }));
}

function getGoalData(goalArray){
  if(Array.isArray(goalArray)){
    const headerTitles = String(goalArray[0]).split(",");
    const formatValues = String(goalArray[1]).split(",");
    const startValues = String(goalArray[2]).split(",");
    const endValues = String(goalArray[3]).split(",");
    
    let goals = {};
    headerTitles.forEach((title, i) => {
      if(i != 0){
        const hiddenTitle = formatHiddenTitle(title);
        const format = formatValues[i].toLowerCase();
        const start = getGoalDateRange(startValues[i], format);
        const end = getGoalDateRange(endValues[i], format);
        const isDescending = getIsDescending(format, start, end);

        goals[hiddenTitle] = { title, format, start, end, isDescending };
      }
    });
    return goals;
  }
}

function getHeadersAndEntries(rawEntries){
  if(Array.isArray(rawEntries)){
    let headers = [];
    let entries = {};
    rawEntries.forEach((entryRow, i) => {
      if(i == 0){
        entryRow.forEach(title => {
          headers.push({ title, hiddenTitle: formatHiddenTitle(title) });
        });
        return;
      }
      
      let jKey = Object.keys(entries).map(key => key === getDateTitle(entryRow[0]) ? key : null ).filter(n => n)[0] ?? null;
      if(jKey === null){
        let sunday;
        let values = {};
        entryRow.forEach((data, j) => {
          if(j == 0){
            sunday = getSundayOfWeek(data);
            return;
          }
          values[headers[j].hiddenTitle] = [data];
        });
        if(sunday != null){
          const dateTitle = getDateTitle(sunday);
          entries[dateTitle] = {sunday, values};
        }
        return;
      }
      Object.keys(entries[jKey].values).forEach((val, j) => {
        entries[jKey].values[val].push(entryRow[j + 1]);
      });
    });
    return { headers, entries };
  }
}

function getDateTitle(date){
  if(dateIsValid(date)){
    let options = { year: '2-digit', month: '2-digit', day: '2-digit' };
    date = getSundayOfWeek(date).toLocaleDateString("en-US", options);
    let splitDate = date.split("/");
    return `${splitDate[2]}${splitDate[0]}${splitDate[1]}`;
  }
  return null;
}

function peakOfEachValueByWeek(entries, goalData){
  Object.keys(entries).forEach(key => {
    let entry = entries[key];
    Object.keys(entry.values).forEach(k => {
      entry.values[k] = pushPeakValueForWeek(entry.values[k], goalData[k]);
    });
  });
}

//gets the range of all the entries to fill in any gaps for the output data
function getDateRange(cleanedEntries, goalData){
  const sortedDateRange = Object.keys(cleanedEntries).map(key => cleanedEntries[key].sunday).sort((date1, date2) => date1 - date2);
  let currentDate = sortedDateRange[0];
  const lastDate = sortedDateRange.reverse()[0];
  const emptyValues = {};
  Object.keys(goalData).forEach(key => {
    if(key != 'dateData') {
      emptyValues[`${key}`] = "";
    }
  });

  let range = {
    [`${getDateTitle(currentDate)}`]: dateRangeObject(currentDate, emptyValues)
  };
  while(new Date(currentDate) < new Date(lastDate)){
    let tempDate = new Date(currentDate.valueOf());
    tempDate.setDate(tempDate.getDate() + 7);
    currentDate = tempDate;
    range[`${getDateTitle(currentDate)}`] = dateRangeObject(currentDate, emptyValues);
  }
  return range;
}

function dateRangeObject(sunday, values){
  return { sunday, values };
}

function fillGapsInEntriesData(entries, dateRange){
  Object.keys(dateRange).forEach(date => {
    let doesNotcontainThisDate = !(entries[date] ?? false);
    if(doesNotcontainThisDate){
      entries[date] = dateRange[date];
    }
  });
}

function fillSingleEmptyEntry(entries){
  let allKeys = Object.keys(entries);
  allKeys.forEach((_, i) => {
    let lastEntry = Object.keys(entries).length - 1;
    if(i > 0 && i < lastEntry){
      Object.keys(entries[allKeys[i]].values).forEach(x => {
        let entry = entries[allKeys[i]].values[x];
        if(entry == ''){
          let prev = entries[allKeys[i - 1]].values[x];
          let next = entries[allKeys[i + 1]].values[x];
          entries[allKeys[i]].values[x] = getValueIfEmpty(prev, next);
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
          // i == 0 => column header titles
          if(i == 0){
            headerKeys.push(formatHiddenTitle(data));
          }
          // j == 0 => row date
          if(i != 0 && j != 0){
            data = data ?? null;
            if(data == ''){
              return '';
            }
            if(data != null){
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
    let goal = goalData[key];
    goals[key] = {
      format: goal.format,
      isDescending: getIsDescending(goal.format, goal.start, goal.end)
    };
  });
  return goals;
}

function pushPeakValueForWeek(allValues, goalDetails){
  let removedEmptyValues = allValues.sort().filter(n => n == null || n != '');
  if(removedEmptyValues.length == 0){
    return "";
  }
  if(removedEmptyValues.length == 1){
    return convertValueToNumberByFormat(goalDetails.format, removedEmptyValues[0]);
  }
  let sortedValues = goalDetails.isDescending
    ? removedEmptyValues
    : removedEmptyValues.reverse();
  return convertValueToNumberByFormat(goalDetails.format, sortedValues[0]);
}

function getSundayOfWeek(rawDate){
  if(dateIsValid(rawDate)){
    const date = new Date(rawDate);
    const setToSunday = date.getDate() - date.getDay();
    return new Date(date.setDate(setToSunday));
  }
  return null;
}

// if the goal start value > end then it isDescending -- if it is true, then the lowest value will be used for the weekly results
function getIsDescending(format, start, end){
  if(format == 'date' || format == 'time'){
    return new Date(start) > new Date(end);
  }
  if(format == 'number'){
    return Number(start) > Number(end);
  }
  console.log(`Unknown format -> ${format} // value ${value}`);
  return false;
}

function convertValueToNumberByFormat(format, value){
  if(value !== ''){
    // Google Sheets stores Times as "Sat Dec 30 1899 00:36:36 GMT-0600 (GMT-06:00)" +- however much time is being passed in
    if(format == 'time'){
      let valueDate = new Date(value);
      let minutes = (valueDate.getHours() * 60) + valueDate.getMinutes() - 36;
      let seconds = valueDate.getSeconds() - 36;
      return minutes + seconds / 60;
    }
    if(format == 'number'){
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

// input "Raw Title" => output "rawTitleData"
const formatHiddenTitle = (str) => `${getCamelCase(str)}Data`;
const slashedDate = (date) => dateIsValid(date) ? new Date(date).toLocaleDateString("en-US") : null;
const dateIsValid = (date) => new Date(date) != 'Invalid Date';
const getValueIfEmpty = (prev, next) => (prev != "" && next != "") ? (prev + next) / 2 : "";
const getGoalDateRange = (value, format) => format == 'date' ? getSundayOfWeek(value) : value;
