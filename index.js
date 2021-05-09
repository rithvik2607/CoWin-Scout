// Import packages
const express = require('express');
const inquirer = require('inquirer');
const axios = require('axios');
const chalk = require('chalk');
var Table = require('cli-table');
const beeper = require('beeper');
const cp = require('child_process');
inquirer.registerPrompt('search-list', require('inquirer-search-list'));

// Objects storing data input by user
let States = []; // Array storing all the States returned by the CoWin API
let Districts = []; // Array storing all the Districts returned by the CoWin API
let districtId = 0; // Stores the ID of the district chosen by the user
let ageRange = ''; // String storing the user response for the desired age range
let age = 0; // Stores the age to compare with CoWin API response

// Objects storing center data
let found = 0; // Store whether a center with free slots is found in the district or not

// getting date from timestamp for using in the API calls
let ts = Date.now();

let date_ob = new Date(ts);
let date = date_ob.getDate();  // returns the day of the month
let month = date_ob.getMonth() + 1; // returns month in integer format. 1 is added since January is returned as 0 and 
                                    // December as 11
let year = date_ob.getFullYear();  // returns year in 4 digit format

let todaysDate = date + "-" + month + "-" + year;

//Greeting the user
console.log('\nHello, Welcome to the Covid Vaccine Scout. I will help you find a vaccine slot.');
console.log('Simply enter your State, District and age. I will find the center and slots for you\n');

// Collect the data regarding States, UTs and their ids
const getStates = async () => {
  try {
    response = await axios.get('https://www.cowin.gov.in/api/v2/admin/location/states');
    return response.data.states;
  } catch (err) {
    console.log(err);
  }
}

// Generating a State list which will be presented to the user to choose from
const genStateList = (list1) => {
  const choices1 = list1.map((item, index) => {
    return {
      key: index,
      name: `${item.state_name}`,
      value: item.state_id
    }
  })
  return {
    type: 'search-list',
    message: 'Which state are you in? You can type the name of the State.',
    name: 'states',
    pageSize: 10,
    choices: choices1
  }
}

// Using States'/UTs' data to collect info about its' districts
const getDistricts = async (stateId) => {
  try {
    response = await axios.get(`https://www.cowin.gov.in/api/v2/admin/location/districts/${stateId}`);
    return response.data.districts;
  } catch (err) {
    console.log(err);
  }
}

// Generating a District list which will be presented to the user to choose from
const genDistrictList = (list2) => {
  const choices2 = list2.map((item, index) => {
    return {
      key: index,
      name: `${item.district_name}`,
      value: item.district_id
    }
  })
  return {
    type: 'search-list',
    message: 'Which district are you in? You can type the name of the District.',
    name: 'district',
    pageSize: 20,
    choices: choices2
  }
}

// Preparing a list for age group selection
const genAgeList = () => {
  return {
    type: 'search-list',
    message: 'Please select age group',
    name: 'age',
    choices: ['18-45', '45+']
  }
}

// Checking for slots
const checkSlots = async () => {
  // We use axios to place a request to the CoWin API. 
  // We call the API by putting the district ID and today's date
  let status = await axios.get(`https://www.cowin.gov.in/api/v2/appointment/sessions/public/calendarByDistrict?district_id=${districtId}&date=${todaysDate}`);
  centers = status.data.centers;  // Extracting and assigning the data regarding centers from the API response  

  found = 0; // Initialing found value

  // For checking whether the center is meeting the criteria of
  // having free slots and desired age range we will use 2 for loops.
  // The outer loop iterates through the list of centers, while the inner
  // loop iterates through each session (i.e each day) of the center.
  for(i = 0; i < centers.length; i++) {
    
    // Table for presenting our slots
    let slotDates = new Table({
      head: ['Date', 'Slots', 'Vaccine']
    , colWidths: [25, 25, 25]
    });
    p = 0;  // variable for keeping track whether the center has free slots for vaccination
  
    for(j = 0; j < centers[i].sessions.length; j++) {

      // condition checking whether the session is open for our desired age range and whether shots are available
      if(centers[i].sessions[j].min_age_limit === age && centers[i].sessions[j].available_capacity) {
        found = 1; // set found to 1 since a center with slots is found
        
        // Beep only once
        if(p != 1) {
          await beeper(3);  // beep! for success
        }
        p = 1; // set p to 1 since this particular center has free slots

        // Store the date, available capacity of vaccine and the name of the vaccine in a table
        slotDates.push([
          centers[i].sessions[j].date, centers[i].sessions[j].available_capacity, centers[i].sessions[j].vaccine
        ]); 
      }
    }

    // Since p is 1 we shall print the details of the current center
    if(p === 1) {

      // Using chalk to add some character to our logs
      console.log(chalk.bold.green('Slots available in', centers[i].district_name ,'!\n'));
      console.log(chalk.cyan('Center name:', centers[i].name, '\nCenter address:', centers[i].address, '\nPincode:', centers[i].pincode, '\n'));
      console.log(slotDates.toString());
      console.log('--------------------------------------');
    }
  }

  // In case found is 0, it means that no center in that district has free slots. So we will display a message that 
  // the data will be updated every minute and an alert will be sent in case there is success
  if(found === 0) {
    console.log(chalk.bold.red('No free slots. I will keep checking every minute. If I find a slot I will beep!\n'));
  }   
}

// Asking user whether they wish to restart the process from a new location or exit
const askUser = () => {
  return [{
    type: 'confirm',
    message: 'Would you like to check for another location?',
    name: 'response1'
  },
  {
    type: 'confirm',
    message: 'Would you like to exit?',
    name: 'response2'
  },
]};


// main function
const main = async () => {
  // Inquirer prompts to collect data from user
  States = await getStates();
  let state = await inquirer.prompt(genStateList(States));
  Districts = await getDistricts(state.states);
  let district = await inquirer.prompt(genDistrictList(Districts));
  ageRange = await inquirer.prompt(genAgeList());

  // setting value for age which will be used by the checkSlots function
  if(ageRange.age === '18-45') {
    age = 18;
  } 
  if(ageRange.age === '45+') {
    age = 45;
  }

  // Assigning district ID to districtId
  districtId = district.district; 
  await checkSlots();  // calling the checkSlots function

  // Repeat checkSlots if found is 0
  // else ask user to check another location 
  // or exit
  if(found === 0) {
    setInterval(checkSlots, 60000);
  }
  else {
    let runAgain = await inquirer.prompt(askUser());
    if(runAgain.response1 === true) {
      found = 0;
      main();
    }
    if(runAgain.response1 === false && runAgain.response2 === true) {
      console.log('Goodbye!! :)'); // exiting the program
    }
    if(runAgain.response1 === false && runAgain.response2 === false) {
      console.log('Now the program will keep checking for slots in the same location every minute. Press CTRL + C to exit');
      setInterval(checkSlots, 60000); // keep checking the data for the same place after each minute
    }
  }
}

main(); // calling the main function