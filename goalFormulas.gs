function dataAsPercentage(goalArray, rawDataArray){
  let goalData = getGoalData(goalArray);
  let filledEntries = formatRawData(goalArray, rawDataArray);
  let output = filledEntriesAsPercentage(filledEntries, goalData);

  return output;
}

function filledEntriesAsPercentage(filledEntries, goalData){
  if(Array.isArray(filledEntries)){
    let headers = [];
    return filledEntries.map((entry, i) => {
      if(Array.isArray(entry)){
        return entry.map((data, j) => {
          if(i == 0){
            headers.push(formatHiddenTitle(data));
          }
          if(j != 0 && i != 0){
            data = data ?? null;
            if(data == ''){
              return '';
            }
            if(data != null){
              let goal = goalData[headers[j]];
              return (goal.start - data)/(goal.start - goal.end);
            }
            return 0;
          }
          return data;
        });
      }
    });
  }
}

function formatRawData(goalArray, rawDataArray){
  const groupedEntries = getGroupEntries(rawDataArray);
  const goalData = getGoalData(goalArray);
  const minMax = minMaxOfEachEntry(groupedEntries, goalData);
  const dateRange = getDateRange(groupedEntries.entries, goalData);
  const mergedArrays = mergedRangeAndMinMax(minMax, dateRange);
  const filledEntries = fillSingleEmptyEntry(groupedEntries.headers, mergedArrays);

  return filledEntries;
}

function fillSingleEmptyEntry(headers, mergedArrays){
  const len = mergedArrays.length - 1;
  let filledEmpties = mergedArrays.map((mergedEntry, i, mArrays) => {
    if(i > 0 && i < len){
      const jLen = mergedEntry.length - 1
      mergedEntry.forEach((entry, j) => {
        if(j > 0 && j < jLen && entry == ''){
          let prev = mArrays[i - 1][j];
          let next = mArrays[i + 1][j];
          mergedArrays[i][j] = getAdjacentValue(prev, next);
        }
      });
    }
    return mergedEntry.map(entry => entry != 0 ? entry : '' );
  });
  return [headers.map(header => header.title)].concat(filledEmpties);
}

const getAdjacentValue = (prev, next) => (prev != "" && next != "") ? (prev + next) / 2 : "";

function mergedRangeAndMinMax(minMax, dateRange){
  return dateRange.map(date => {
    let i = minMax.map((m, j) => (slashedDate(date[0]) == slashedDate(m[0])) ? `${j}`: null ).filter(n => n).map(n => Number(n))[0] ?? null;
    return i != null ? minMax[i] : date;
  });
}

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

const slashedDate = (date) => new Date(date).toLocaleDateString("en-US");

function getGoalDetails(goalData){
  let goals = {};
  Object.keys(goalData).forEach(key => {
    let goal = goalData[key];
    goals[key] = {
      format: goal.format,
      isDescending: formatForIsDescending(goal.format, goal.start, goal.end)
    };
  });
  return goals;
}

function minMaxOfEachEntry(cleanedEntries, goalData){
  return cleanedEntries.entries.map((cleanEntry) => {
    return [cleanEntry.date].concat(Object.keys(cleanEntry.values).map(key => {
      return addVal(cleanEntry.values[key], goalData[key]);
    }));
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
    let rowEntries = String(rawData).split(",").map(data => {
      return `"${data}"`;
    });
    return `[${rowEntries.join(",")}],`;
  });
}

function entryIndex(entry, mergedEntries){
  return mergedEntries.map((mergedEntry, i) => {
    return slashedDate(entry.date) == slashedDate(mergedEntry.date) ? `${i}` : null;
  }).filter(n => n).map(n => Number(n))[0] ?? -1;
}

function getGroupEntries(rawEntries){
  if(Array.isArray(rawEntries)){
    let headers = [];
    let entries = [];
    rawEntries.forEach((rawEntry, i) => {
      if(i == 0){
        rawEntry.forEach(raw => {
          headers.push({ title: raw, hiddenTitle: formatHiddenTitle(raw) });
        });
      }else{
        let ind = entries.map((entry, j) => {
          let eDate = getSundayOfWeek(entry.date);
          let rDate = getSundayOfWeek(rawEntry[0]);
          if(slashedDate(eDate) == slashedDate(rDate)){
            return `${j}`;
          }
          return null;
        }).filter(n => n).map(n => Number(n))[0] ?? null;
  
        if(ind == null){
          let raw = { date: null, values: {} };
          rawEntry.forEach((entry, j) => {
            if(j == 0){
              raw.date = getSundayOfWeek(entry);
            }else{
              raw.values[headers[j].hiddenTitle] = [entry];
            }
          });
          if(raw.date != null){
            entries.push(raw);
          }
        }else{
          Object.keys(entries[ind].values).forEach((val, j) => {
            entries[ind].values[val].push(rawEntry[j + 1]);
          });
        }
      }
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
    var headerTitles = String(goalArray[0]).split(",");
    var formatValues = String(goalArray[1]).split(",");
    var startValues = String(goalArray[2]).split(",");
    var endValues = String(goalArray[3]).split(",");
    
    let goal = {};
    headerTitles.forEach((title, i) => {
      if(i != 0){
        let hiddenTitle = formatHiddenTitle(title);

        let format = formatValues[i].toLowerCase();
        let start = getGoalDateRange(startValues[i], format);
        let end = getGoalDateRange(endValues[i], format);

        goal[hiddenTitle] = {
          title,
          format,
          start,
          end,
          isDescending: formatForIsDescending(format, start, end)
          };
      }
    });
    return goal;
  }
}

function formatForIsDescending(format, start, end){
  if(format == 'date' || format == 'time'){
    return new Date(start) > new Date(end);
  }
  if(format == 'number'){
    return Number(start) > Number(end);
  }
  console.log(`Unknown format -> ${format} // value ${value}`);
  return false;
}

const getGoalDateRange = (value, format) => format == 'date' ? getSundayOfWeek(value) : value;

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
