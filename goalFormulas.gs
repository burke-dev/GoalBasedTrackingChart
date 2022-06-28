function dataAsPercentage(goalArray, rawDataArray){
  const formattedData = getFormattedData(goalArray, rawDataArray);
  const valuesAsPercentage = getEntriesAsPercentageOfGoals(formattedData);

  return valuesAsPercentage;
}

function formatRawData(goalArray, rawDataArray){
  const formattedData = getFormattedData(goalArray, rawDataArray);

  return formattedData.filledEntries;
}

function getFormattedData(goalArray, rawDataArray){
  const headersAndEntriesObj = getHeadersAndEntries(rawDataArray);
  const goalData = getGoalData(goalArray);
  const minMax = minMaxOfEachEntry(headersAndEntriesObj.entries, goalData);
  const dateRange = getDateRange(headersAndEntriesObj.entries, goalData);
  const mergedArrays = mergedRangeAndMinMax(minMax, dateRange);
  const filledEntries = fillSingleEmptyEntry(headersAndEntriesObj.headers, mergedArrays);
  
  return { filledEntries, goalData };
}

function getEntriesAsPercentageOfGoals(formatedData){
  if(Array.isArray(formatedData.filledEntries)){
    let headers = [];
    return formatedData.filledEntries.map((entry, i) => {
      if(Array.isArray(entry)){
        return entry.map((data, j) => {
          // i == 0 => column header titles
          if(i == 0){
            headers.push(formatHiddenTitle(data));
          }
          // j == 0 => row date
          if(i != 0 && j != 0){
            data = data ?? null;
            if(data == ''){
              return '';
            }
            if(data != null){
              let goal = formatedData.goalData[headers[j]];
              let start = formatValue(goal.format, goal.start);
              let end = formatValue(goal.format, goal.end);
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

function fillSingleEmptyEntry(headers, mergedArrays){
  const len = mergedArrays.length - 1;
  const filledEmpties = mergedArrays.map((mergedEntry, i) => {
    if(i > 0 && i < len){
      const jLen = mergedEntry.length - 1
      return mergedEntry.map((entry, j) => {
        if(j > 0 && j < jLen && entry == ''){
          const prev = mergedArrays[i - 1][j] ?? "";
          const next = mergedArrays[i + 1][j] ?? "";
          return getAdjacentValue(prev, next);
        }
        return entry;
      });
    }
    return mergedEntry.map(entry => entry != 0 ? entry : '' );
  });
  return [headers.map(header => header.title)].concat(filledEmpties);
}

const getAdjacentValue = (prev, next) => (prev != "" && next != "") ? (prev + next) / 2 : "";

function mergedRangeAndMinMax(minMax, dateRange){
  return dateRange.map(date => {
    const i = minMax.map((m, j) => (slashedDate(date[0]) == slashedDate(m[0])) ? `${j}`: null ).filter(n => n).map(n => Number(n))[0] ?? null;
    return i != null ? minMax[i] : date;
  });
}

//gets the range of all the entries to fill in any gaps for the output data
function getDateRange(cleanedEntries, goalData){
  const sortedDateRange = cleanedEntries.map(entry => entry.date).sort((date1, date2) => date1 - date2);
  let currentDate = sortedDateRange[0];
  const lastDate = sortedDateRange.reverse()[0];
  const emptyValues = Object.keys(goalData).map(_ => "");

  let range = [[currentDate, ...emptyValues]];
  while(new Date(currentDate) < new Date(lastDate)){
    let tempDate = new Date(currentDate.valueOf());
    tempDate.setDate(tempDate.getDate() + 7);
    currentDate = tempDate;
    range.push([currentDate, ...emptyValues]);
  }
  return range;
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

function minMaxOfEachEntry(entries, goalData){
  return entries.map(entry => {
    return [entry.date].concat(Object.keys(entry.values).map(key => addVal(entry.values[key], goalData[key])));
  });
}

function addVal(allValues, goalDetails){
  let removedEmptyValues = allValues.sort().filter(n => n == null || n != '');
  if(removedEmptyValues.length == 0){
    return "";
  }
  if(removedEmptyValues.length == 1){
    return formatValue(goalDetails.format, removedEmptyValues[0]);
  }
  let sortedValues = goalDetails.isDescending
    ? removedEmptyValues
    : removedEmptyValues.reverse();
  return formatValue(goalDetails.format, sortedValues[0]);
}

function formatRawDataForExport(rawDataArray){
  return rawDataArray.map(rawData => {
    let rowEntries = String(rawData).split(",").map(data => `"${data}"`);
    return `[${rowEntries.join(",")}],`;
  });
}

function getHeadersAndEntries(rawEntries){
  if(Array.isArray(rawEntries)){
    let headers = [];
    let entries = [];
    rawEntries.forEach((entryRow, i) => {
      if(i == 0){
        entryRow.forEach(title => {
          headers.push({ title, hiddenTitle: formatHiddenTitle(title) });
        });
        return;
      }
      let ind = entries.map((entry, j) => {
        const entryDate = getSundayOfWeek(entry.date);
        const rowDate = getSundayOfWeek(entryRow[0]);
        return slashedDate(entryDate) == slashedDate(rowDate) ? `${j}` : null;
      }).filter(n => n).map(n => Number(n))[0] ?? null;

      if(ind == null){
        let date;
        let values = {};
        entryRow.forEach((entry, j) => {
          if(j == 0){
            date = getSundayOfWeek(entry);
            return;
          }
          values[headers[j].hiddenTitle] = [entry];
        });
        if(date != null){
          entries.push({date, values});
        }
        return;
      }
      Object.keys(entries[ind].values).forEach((val, j) => {
        entries[ind].values[val].push(entryRow[j + 1]);
      });
    });
    return { headers, entries };
  }
}

function getSundayOfWeek(rawDate){
  if(rawDate.length != 0){
    const date = new Date(rawDate);
    const setToSunday = date.getDate() - date.getDay();
    return new Date(date.setDate(setToSunday));
  }
  return null;
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

function formatValue(format, value){
  if(value !== ''){
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

function formatHiddenTitle(str) {
  return str
      .replace(/[^\w\s]/gi, '')
      .replace(/\s(.)/g, a => a.toUpperCase())
      .replace(/\s/g, '')
      .replace(/^(.)/, b => b.toLowerCase())
    +"Data";
}

const slashedDate = (date) => new Date(date).toLocaleDateString("en-US");

const getGoalDateRange = (value, format) => format == 'date' ? getSundayOfWeek(value) : value;
