/* *
 * This sample demonstrates handling intents from an Alexa skill using the Alexa Skills Kit SDK (v2).
 * Please visit https://alexa.design/cookbook for additional examples on implementing slots, dialog management,
 * session persistence, api calls, and more.
 * */
const Alexa = require('ask-sdk-core');

const interceptors = require('./interceptors');
const util = require('./util'); // utility functions
const logic = require('./logic'); // this file encapsulates all "business" logic
const constants = require('./constants');
const moment = require('moment-timezone'); // will help us do all the dates math while considering the timezone


const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    handle(handlerInput) {
        
 
        // check if the user has given permission for reminders to the skill from the alexa app
        const reminderApiClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient(),
        { permissions } = handlerInput.requestEnvelope.context.System.user 
        
        let substr=permissions["scopes"];
        substr=JSON.stringify(substr);
        let checksub=substr.indexOf("DENIED");
        
        if(permissions===undefined || checksub>=0) {
        
            
            return handlerInput.responseBuilder
               .speak("Per favore, dàmmi i permessi nella sezione Attività dell'app Alexa, poi riapri la skill dicendo: Alexa, apri Medico Virtuale! ")
               .getResponse()
        }
        
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        
        let name = sessionAttributes['name'];
        let access_token = sessionAttributes['access_token'];
     
        if (!name || !access_token){
            
            const speakOutput =  ' Il tuo codice di sicurezza non è ancora stato registrato. Se non ne disponi vai sul sito di intake care e creane uno, altrimenti dimmi: Alexa, inserisci il codice di sicurezza';
            // utterance of SecurityCodeIntent
            
            return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt()
            .getResponse();
        }
        
        console.log("Launch Intent completed successfully.")
            
        return LoadTherapiesIntentHandler.handle(handlerInput);
         
    }
};


const SecurityCodeIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SecurityCodeIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
     
        // saving the otp spoken by the user to alexa
        let otp = handlerInput.requestEnvelope.request.intent.slots.otpnew.value;
       
        // via the logic.getAccessToken function getting 'name' and 'access_token' and save them in session
        let response;
        
        await logic.getAccessToken(otp).then(res =>{
            console.log('res: '+ res)
                response = res;
            })
            .catch((error) => {
                console.log(error);
               
            });
            
        if(!response){
            const speakOutput =  `Il tuo codice di sicurezza è incorretto o non è ancora stato registrato. 
            Se non ne disponi puoi crearlo sul sito di intake care, altrimenti dimmi: inserisci il codice di sicurezza`;
            // utterance of SecurityCodeIntent
            
            return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt()
            .getResponse();
        }
        else{
            let name = response.data.user.name?response.data.user.name:"utente";
            sessionAttributes['name'] = name;
            let access_token = response.data.access_token;
            sessionAttributes['access_token'] = access_token;
            console.log('name '+ name + ' --- token: '+ access_token)
            // Post logs
            let typeOfAccess = 'Security Code Intent';
            let logResponse = await logic.postLogs(access_token, typeOfAccess);
        
            const speakOutput = `Ciao ${name}! Di: Alexa configura le mie terapie, per procedere`;
            // utterance of LoadTherapiesIntent
        
            return handlerInput.responseBuilder
                .speak(speakOutput)
                .reprompt()
                .getResponse();
        }
    }
};


const LoadTherapiesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'LoadTherapiesIntent';
    },
    async handle(handlerInput) {
        
        
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        let access_token = sessionAttributes['access_token'];
        
        let count_new_therapies = 0;
        let count_updated_therapies = 0;
        sessionAttributes['count_new_therapies'] = count_new_therapies;
        sessionAttributes['count_updated_therapies'] = count_updated_therapies;
      
      
      
       const timezone = "Europe/Rome";
       
        let startDate = logic.convertDateForDatabase(moment().tz(timezone).subtract(7, 'days')); // bisogna farlo iniziare prima del giorno stesso
        let endDate = logic.convertDateForDatabase(moment().tz(timezone).add(4, 'months')); 
        let therapiesChecked= await logic.getTherapies(access_token,startDate,endDate) 
       
        sessionAttributes['all_therapies'] = therapiesChecked.all_therapies;
        //save in edit_therapies therapies that have therapy.edit = 'updated' or 'new'
        sessionAttributes['edit_therapies'] = therapiesChecked.edit_therapies;
        //save in updated_therapies therapies that have therapy.edit ='updated'
        sessionAttributes['updated_therapies'] = therapiesChecked.updated_therapies;
        //save in new_therapies that have therapy.edit='new' e therapy.state = true
        sessionAttributes['new_therapies'] = therapiesChecked.new_therapies;
     
      
      
        // Post logs
        let typeOfAccess = 'Load Therapies Intent';
        let logResponse = await logic.postLogs(access_token, typeOfAccess);
      
        console.log('all ' + JSON.stringify(therapiesChecked.all_therapies))
        return SayTherapyIntentHandler.handle(handlerInput);
         
       
    }
};

const SayTherapyIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'SayTherapyIntent';
    },
    async handle(handlerInput) {
        
        
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        let access_token = sessionAttributes['access_token'];
        //get Therapies that have therapy.edit='new' e therapy.state = true
        let count_new_therapies = sessionAttributes['count_new_therapies'];
        let new_therapies = sessionAttributes['new_therapies'];

        //get Therapies that have therapy.edit ='updated'
        let count_updated_therapies = sessionAttributes['count_updated_therapies'];
        let updated_therapies = sessionAttributes['updated_therapies'];
        
        let speakOutput;
        //manage Therapies that have therapy.edit='new' to setup
        if(count_new_therapies < new_therapies.length) {
            let new_therapy_name  = new_therapies[count_new_therapies].drug.split("-")[0];
            speakOutput =  `è disponibile una terapia con il farmaco ${new_therapy_name}. 
            Se vuoi inserirla dimmi: Alexa, inserisci questa terapia.`;
            // utterance of CreateTherapyIntentHandler
        }  
        //manage Therapies that have therapy.edit='updated' to setup
        else if(count_new_therapies >= new_therapies.length && count_updated_therapies < updated_therapies.length){
            
            let updated_therapy_name  = updated_therapies[count_updated_therapies].drug.split("-")[0];
            speakOutput =  `è stata modificata la terapia con il farmaco ${updated_therapy_name}. 
            Se vuoi aggiornarla dimmi: Alexa, modifica questa terapia.`;
            // utterance of ModifyTherapyIntentHandlerReminderIntent
        }
        // if all therapies 'new' and 'updated' are set up, inizialize count and exit from the intent
        else if(count_new_therapies >= new_therapies.length && count_updated_therapies >= updated_therapies.length){
            count_new_therapies = 0;
            count_updated_therapies = 0;
            sessionAttributes['count_new_therapies'] = count_new_therapies;
            sessionAttributes['count_updated_therapies'] = count_updated_therapies;
            const timezone = "Europe/Rome";
            let startDate = logic.convertDateForDatabase(moment().tz(timezone).subtract(7, 'days')); // bisogna farlo iniziare prima del giorno stesso
            let endDate = logic.convertDateForDatabase(moment().tz(timezone).add(4, 'months')); 
            let therapiesChecked= await logic.getTherapies(access_token,startDate,endDate); 
            sessionAttributes['all_therapies'] = therapiesChecked.all_therapies;
            
          console.log('rem  ' + sessionAttributes['reminders'])
            speakOutput = "I promemoria per i tuoi farmaci sono stati configurati. Dimmi: Alexa, chiedi a Medico Virtuale di segnarsi che ho preso le medicine, quando l'avrai fatto. ";
        }
    

        return handlerInput.responseBuilder
            .speak(speakOutput)
        
            .reprompt()
            .getResponse();
    }

       
};

const CreateTherapyIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'CreateTherapyIntent';
    },
    async handle(handlerInput) {
        const reminderApiClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        let count_new_therapies = sessionAttributes['count_new_therapies'];
        
        // get new_therapies that have therapy.edit='new' e therapy.state = true
        let new_therapies = sessionAttributes['new_therapies'];

        // get reminders_ids w/ all objects reminders_id
        let reminders_ids = sessionAttributes['reminders'];
        
        if (!reminders_ids) {
            reminders_ids = [];
        }

        if(reminders_ids.length===0){
            reminders_ids = [];
        }
        
        // select a therapy
        let therapy = await new_therapies[count_new_therapies];
       
        let last_intake_time = logic.getLastIntakeTime(therapy);


        // create the body for the reminders to create through logic.setTherapy
        let reminderBody = await logic.setTherapy(therapy);
       console.log('remBody ' + JSON.stringify(reminderBody))
        // creazione del reminders e alert
        
        for (let i=0; i < reminderBody.remindersAlert.length; i++)  {
            
            let reminderAlertResponse = await reminderApiClient.createReminder(reminderBody.remindersAlert[i]);
            
            
            let reminderConfirmationResponse = await reminderApiClient.createReminder(reminderBody.remindersConfirmation[i]);  
            
            // salvataggio alert token
            let reminderAlertToken = await reminderAlertResponse.alertToken;
            let reminderConfirmationToken = await reminderConfirmationResponse.alertToken;
            
            let reminder_id = {
                    "therapy_id": therapy._id, // controlla che sia 'id' il nome del campo
                    "alertToken" : reminderAlertToken,
                    "confirmationToken" : reminderConfirmationToken,
                    "last_intake_time" : last_intake_time,
                    
                }
            reminders_ids.push(reminder_id);
        }

        sessionAttributes['reminders'] = reminders_ids;
        console.log('rem 276 '+ JSON.stringify(sessionAttributes['reminders']))
        //modifico nel DB il campo therapy.edit in 'saved'
        let access_token = sessionAttributes['access_token'];
        
        let response = await logic.patchTherapy(access_token, therapy._id, "saved");
        
        count_new_therapies ++;
        
       
        
        
        sessionAttributes['count_new_therapies'] = count_new_therapies;
        console.log('index 275')
        return SayTherapyIntentHandler.handle(handlerInput);
    }
};

const ModifyTherapyIntentHandler = {
    
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ModifyTherapyIntent';
    },
    async handle(handlerInput) {
        const reminderApiClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        
        let speakOutput;
        let count_updated_therapies = sessionAttributes['count_updated_therapies'];
        let updated_therapies = sessionAttributes['updated_therapies'];
        let reminders_ids = sessionAttributes['reminders'];
        
        if (!reminders_ids) {
            reminders_ids = [];
        }
        if(reminders_ids.length===0){
            reminders_ids = [];
        }
        
        let therapy = await updated_therapies[count_updated_therapies];
        
        let last_intake_time = logic.getLastIntakeTime(therapy);

        // trovo l'oggetto reminder che ha therapy_id 
        let therapy_todelete = reminders_ids.filter(reminder_id => reminder_id.therapy_id === therapy._id);
        console.log('to del  ' + JSON.stringify(therapy_todelete))
        //controllo se esiste
        let remindersList = await reminderApiClient.getReminders();
        let aT;
        
        if (remindersList.alerts.length > 0){
          
            
            for (let d=0; d<remindersList.alerts.length; d++){
                
                aT= remindersList.alerts[d].alertToken;
            
                if (therapy_todelete.length > 0){
                    if (aT === therapy_todelete[0].alertToken){
                        await reminderApiClient.deleteReminder(therapy_todelete[0].alertToken);
                        await reminderApiClient.deleteReminder(therapy_todelete[0].confirmationToken);
                    }
                }
            }
        
        }
        
        
        // risalvo in sessione i reminders rimanenti (rimuovendo quello eliminato)
        let reminders_ids_left = reminders_ids.filter(reminder_id => reminder_id.therapy_id !== therapy._id);
        sessionAttributes['reminders'] = reminders_ids_left;
         console.log('left  ' + JSON.stringify(reminders_ids_left))
         console.log('rem id   ' + JSON.stringify( reminders_ids))
        // se il therapy.state è true vuol dire che la terapia è ancora attiva quindi andiamo a reimpostare reminders con dati aggiornati
        console.log('state' + therapy.state)
         if (therapy.state === true){
            let reminderBody = await logic.setTherapy(therapy);
            
            let reminders_ids = sessionAttributes['reminders'];
        
            for (let i=0; i < reminderBody.remindersAlert.length; i++)  {
                 
                
                let reminderAlertResponse = await reminderApiClient.createReminder(reminderBody.remindersAlert[i]);
                let reminderConfirmationResponse = await reminderApiClient.createReminder(reminderBody.remindersConfirmation[i]);  
           
                //salvataggio alert token dei reminders apppena creati
                 let reminderAlertToken = await reminderAlertResponse.alertToken;
                 let reminderConfirmationToken = await reminderConfirmationResponse.alertToken;
                //aggiungo l'oggetto nell'array reminders_ids
                let reminder_id = {
                        "therapy_id": therapy._id, // controlla che sia 'id' il nome del campo
                        "alertToken" : reminderAlertToken,
                        "confirmationToken" : reminderConfirmationToken,
                        "last_intake_time" : last_intake_time
                    }
                
                reminders_ids.push(reminder_id);
            }
            sessionAttributes['reminders'] = reminders_ids;
        }
     
        
        // modifico nel DB il campo 'edit' in 'saved'
        let access_token = sessionAttributes['access_token'];
        
 
          
        if (therapy.edit === 'updated'){
            let response = await logic.patchTherapy(access_token, therapy._id, "saved"); 
        }
        else if (therapy.edit === 'todelete'){
            let response = await logic.patchTherapy(access_token, therapy._id, "deleted"); 
        }
        
        count_updated_therapies ++;
        
        sessionAttributes['count_updated_therapies'] = count_updated_therapies;
        
        return SayTherapyIntentHandler.handle(handlerInput);
     
            
    }
};





const WhichMedicineTodayIntent = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'WhichMedicineTodayIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        let count_intakes = 0;
        sessionAttributes['count_intakes'] = count_intakes;
        sessionAttributes['signed_medicine_MSG'] = ` `;
        let access_token = sessionAttributes['access_token'];


        const timezone = "Europe/Rome";
        let startDate = logic.convertDateForDatabase(moment().tz(timezone).subtract(7, 'days')); // bisogna farlo iniziare prima del giorno stesso
        let endDate = logic.convertDateForDatabase(moment().tz(timezone).add(4, 'months')); 
        let therapiesChecked= await logic.getTherapies(access_token,startDate,endDate); 
  
      
    if (therapiesChecked.edit_therapies.length !==0 ||  therapiesChecked.new_therapies.length !==0 || therapiesChecked.updated_therapies.length !==0 ){
        let speakOutput="Ci sono state modifiche alle tue terapie. Dì Alexa, apri medico virtuale e poi richiedimi che medicine devo prendere"
           
            
            return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt()
            .getResponse();
            
    }
    
    let list_therapies = sessionAttributes['all_therapies'];
    
            let intakes_all =[];
            for (let t=0; t < list_therapies.length; t++)  {
                intakes_all= intakes_all.concat(list_therapies[t].intakes);
            }
            
            let list_programmed_intakes = intakes_all.filter(intake => intake.status === 'programmed');
          
            const currentTime = moment().tz(timezone);
            let today = currentTime.format('l'); 
            list_programmed_intakes = list_programmed_intakes.filter(intake => intake.programmed_date.format('l') === today);
            
        
        let speakOutput;
         for (let t=0; t < list_programmed_intakes.length; t++)  {
                speakOutput= speakOutput.concat(list_programmed_intakes[t].drug.split("-")[0], ' alle ');
                speakOutput= speakOutput.concat(list_programmed_intakes[t].programmed_date.format('LT'), ' ');
            }
        
        
       
        // Post logs
        let typeOfAccess = 'WhichMedicineTodayIntent';
        let logResponse = await logic.postLogs(access_token, typeOfAccess);
        console.log(logResponse)
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt()
            .getResponse();
        
    }
};











const ConfirmIntakeIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'ConfirmIntakeIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        let count_intakes = 0;
        sessionAttributes['count_intakes'] = count_intakes;
        sessionAttributes['signed_medicine_MSG'] = ` `;
        let access_token = sessionAttributes['access_token'];
       

         const timezone = "Europe/Rome";
        let startDate = logic.convertDateForDatabase(moment().tz(timezone).subtract(7, 'days')); // bisogna farlo iniziare prima del giorno stesso
        let endDate = logic.convertDateForDatabase(moment().tz(timezone).add(4, 'months')); 
        let therapiesChecked= await logic.getTherapies(access_token,startDate,endDate); 

      
    if (therapiesChecked.edit_therapies.length !==0 ||  therapiesChecked.new_therapies.length !==0 || therapiesChecked.updated_therapies.length !==0 ){
        let speakOutput="Ci sono state modifiche alle tue terapie, aggiornale prima di segnare che hai preso le medicine. Dì Alexa, apri medico virtuale"
            return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt()
            .getResponse();
    }
    
        // Post logs
        let typeOfAccess = 'Confirm Intake Intent';
        let logResponse = await logic.postLogs(access_token, typeOfAccess);
        console.log(logResponse)
       
           
        return WhichMedicineIntentHandler.handle(handlerInput); 
    }
};

const WhichMedicineIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'WhichMedicineIntent';
    },
   
   async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        let count_intakes = sessionAttributes['count_intakes'];
        let list_interval_intakes =[];
        let speakOutput
        if (!count_intakes){
            count_intakes = 0;
            sessionAttributes['count_intakes'] = count_intakes;
        }
        if(count_intakes===0){
            let list_therapies = sessionAttributes['all_therapies'];
           
            let intakes_all =[];
            for (let t=0; t < list_therapies.length; t++)  {
                intakes_all= intakes_all.concat(list_therapies[t].intakes);
            }
          
            let list_programmed_intakes = intakes_all.filter(intake => intake.status === 'programmed');
           
            // creazione dell'attributo che tiene in memoria quando il paziente dice di aver preso le medicine, ogni tot cambia messaggio al prossimo reminder
            // aggiungere attributo al file constants. il counter incrementa a yes intent o no intent
            
            
          
            //prendiamo gli intakes compresi nell'intervallo di tempo t precedente alla richiesta
            const timezone = "Europe/Rome"; 
            const currentTime = moment().tz(timezone);
       
            let min
            let max
            let intake
            for (let t=0; t < list_programmed_intakes.length; t++)  {
                let temp= Math.floor((list_programmed_intakes[t].max_delay)/2);
                 min = moment(currentTime).tz(timezone).startOf('minute').subtract(temp, 'minutes'); //modificare in base a max_delay
                 max = moment(currentTime).tz(timezone).startOf('minute').add(temp, 'minutes');
                
                 intake=list_programmed_intakes[t];
               
                 if( moment(logic.convertDateFromDatabase(intake.programmed_date)).isSameOrAfter(min) && moment(logic.convertDateFromDatabase(intake.programmed_date)).isSameOrBefore(max) )
                 {
                  list_interval_intakes.push(intake)
                     
                 }
                
            }
 
            sessionAttributes['list_interval_intakes'] = list_interval_intakes;
            
        }
        console.log('intakes' + JSON.stringify(list_interval_intakes))
        
       
        if(list_interval_intakes.length === 0){
            
            
            console.log('rem  ' + JSON.stringify( sessionAttributes['reminders']))
            const speakOutput = 'In questo momento non sono previsti farmaci da prendere. Riprova più tardi o controlla i tuoi promemoria'
            return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt()
            .getResponse();
        }
        
       
        
        
        
        
        let medicine_name  = list_interval_intakes[count_intakes].drug.split("-")[0];
        let medicine_posology = list_interval_intakes[count_intakes].posology;
        
        let signed_medicine_MSG = sessionAttributes['signed_medicine_MSG'];
        
         speakOutput = signed_medicine_MSG + `Hai preso ${medicine_posology} di ${medicine_name}?`;
        sessionAttributes['signed_medicine_MSG'] = ` `;
  
        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt()
            .getResponse();
     
  

       
   }
};
/*
const YesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent';
    },
    async handle(handlerInput) {
        
        
        
        
        let speakOutput
         
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const reminderApiClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
        
       
        let count_intakes = sessionAttributes['count_intakes'];
        let list_interval_intakes = sessionAttributes['list_interval_intakes'];
        let access_token = sessionAttributes['access_token'];

        
     
        //Gestire invio intake al DB (modifica del campo status in 'taken' e invio del campo intake_delay) 
        let intake_id = list_interval_intakes[count_intakes]._id;
         
        
        let time_intake = logic.convertDateFromDatabase(list_interval_intakes[count_intakes].programmed_date);
        let status = "taken";
        const timezone = "Europe/Rome";
        let currentTime = moment().tz(timezone);
        let delay = moment.duration(currentTime.diff(time_intake, 'minutes'));
        let intake_delay = Number(delay);
    
        
    
     /*speakOutput=`${intake_id} `
          
         
    
          
         
        
          console.log('rem  ' + JSON.stringify(sessionAttributes['reminders']))
        // salvo il therapy id specifico di cui stiamo parlando, tramite il count_intakes
        let intervalTherapy_id = list_interval_intakes[count_intakes].therapy_id;
        console.log('response' + count_intakes)
        console.log('response' + JSON.stringify(list_interval_intakes))
        // filtro oggetti reminders che hanno therapy_id uguale a quello appena salvato 
        let reminders = sessionAttributes['reminders'];   
         console.log('rem ' + reminders )
        
       
       
     
       let reminder_idToUpdate = reminders.filter(reminders => reminders.therapy_id === intervalTherapy_id);
        
      console.log('id to udpdate  '   +JSON.stringify(reminder_idToUpdate))
    speakOutput=`${JSON.stringify(reminders)}`
             
       
        let confirmationTokenToUpdate = reminder_idToUpdate[0].confirmationToken;
        speakOutput=`${confirmationTokenToUpdate} ` 
       
       let oldReminderConfirmation = await reminderApiClient.getReminder(confirmationTokenToUpdate);
           speakOutput=`${JSON.stringify(oldReminderConfirmation)} ` 
          
       
       
        
        
     
       
          
     /*       
     
        
        let newTime = oldReminderConfirmation.trigger.recurrence.startDateTime;
      /*
        newTime= logic.convertDateFromDatabase(newTime).add(1,"days");//;
        //newTime=newTime.format('YYYY-MM-DDTHH');
                 
        //modifico il body sostituendo la startDateTime
        
        let updatedReminder =  oldReminderConfirmation;
        
        updatedReminder.trigger.recurrence.startDateTime = newTime;

       
        
    
    console.log ('old ' + JSON.stringify(oldReminderConfirmation))
    const alertToken = confirmationTokenToUpdate;
    
    
    let end = oldReminderConfirmation.trigger.recurrence.endDateTime;
     end =logic.convertDateFromDatabase(end);
     console.log('t  '+newTime.format('l'))
     //end=end.format('YYYY-MM-DDTHH');
     
     
     
     let recurrenceRulesUpdated=oldReminderConfirmation.trigger.recurrence.recurrenceRules
     let textUpdated=oldReminderConfirmation.alertInfo.text;
     
     
     
     
     
    
    await reminderApiClient.deleteReminder(alertToken)
     
         if (moment(newTime.format('l')).isSameOrBefore(end.format('l')))   {
     end=logic.convertDateForDatabase(end);
      
    console.log(newTime)
    console.log(oldReminderConfirmation.trigger.recurrence.recurrenceRules)
    newTime=logic.convertDateForDatabase(newTime);
    
 
    
    let body =    {
            requestTime: "2024-02-26T12:00:00.000",
            trigger: {
                type: "SCHEDULED_ABSOLUTE",
                timeZoneId: "Europe/Rome",
                recurrence: {
                    startDateTime: newTime,
                    endDateTime: end,
                    recurrenceRules:  recurrenceRulesUpdated
                 
                },
               
            },
            alertInfo: {
                spokenInfo: {
                    content: [
                        {
                            locale: "it-IT",
                            text: textUpdated
                        }
                    ]
                }
            },
            pushNotification: {
                status: "ENABLED"
            }
           
        };
        console.log('body '+ JSON.stringify(body))

    
    
        
   let updatedRem = await reminderApiClient.createReminder(body);
   let reminderAlertToken = await updatedRem.alertToken;
   let reminders_ids_left = reminders.filter(reminders => reminders.confirmationToken !== reminder_idToUpdate);
   let reminders_new = reminders.filter(reminders => reminders.confirmationToken === reminder_idToUpdate)
   reminders_new.confirmationToken = reminderAlertToken; 
   reminders_ids_left.push(reminders_new);      
   sessionAttributes['reminders'] = reminders_ids_left;
}       
         
     
        
        
        
        // Post logs
        let typeOfAccess = 'Yes Intent';
        let logResponse = await logic.postLogs(access_token, typeOfAccess);
        console.log('logresponse   ' + logResponse)
        //modifica all_therapies da sessione 
        let list_therapies = sessionAttributes['all_therapies'];
        let medicineIndex = list_therapies.findIndex(medicine => medicine._id === intervalTherapy_id);

        let intakeIndex = list_therapies[medicineIndex].intakes.findIndex(intake => intake._id === intake_id);

        list_therapies[medicineIndex].intakes[intakeIndex].status = status;
        sessionAttributes['all_therapies'] = list_therapies;

        if( count_intakes >= list_interval_intakes.length -1) {
            count_intakes = 0;
            sessionAttributes['count_intakes'] = count_intakes;
            
            const speakOutput = 'Ok! Ho segnato la tua medicina come presa! Ho registrato tutto per ora!'
            sessionAttributes['list_interval_intakes'] = [];
            return handlerInput.responseBuilder
                .speak(speakOutput)
                //.reprompt()
                .getResponse();
        }
        
        count_intakes++;
        sessionAttributes['count_intakes'] = count_intakes;
        sessionAttributes['signed_medicine_MSG'] = `Ok! Ho segnato la tua medicina come presa!`;
        let response = await logic.patchIntake(access_token, intake_id, status, intake_delay);
        
        return WhichMedicineIntentHandler.handle(handlerInput) 
        
         
     
    }
};
*/
const YesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.YesIntent';
    },
    async handle(handlerInput) {
        
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        const reminderApiClient = handlerInput.serviceClientFactory.getReminderManagementServiceClient();
        
        let count_intakes = sessionAttributes['count_intakes'];
        let list_interval_intakes = sessionAttributes['list_interval_intakes'];
        let access_token = sessionAttributes['access_token'];
  

        //Gestire invio intake al DB (modifica del campo status in 'taken' e invio del campo intake_delay) 
        let intake_id = list_interval_intakes[count_intakes]._id;
        let time_intake = logic.convertDateFromDatabase(list_interval_intakes[count_intakes].programmed_date);
        let status = "taken";
        const timezone = "Europe/Rome";
        let currentTime = moment().tz(timezone);
        let delay = moment.duration(currentTime.diff(time_intake, 'minutes'));
        let intake_delay = Number(delay);
        
        let response = await logic.patchIntake(access_token, intake_id, status, intake_delay);
       
        // salvo il therapy id specifico di cui stiamo parlando, tramite il count_intakes
        let intervalTherapy_id = list_interval_intakes[count_intakes].therapy_id;
 
        
        // filtro oggetti reminders che hanno therapy_id uguale a quello appena salvato 
        let reminders = sessionAttributes['reminders'];
        
        let reminder_idToUpdate = reminders.filter(reminders => reminders.therapy_id === intervalTherapy_id);
        
    
  
        let last_intake_time = moment(reminder_idToUpdate[0].last_intake_time).tz(timezone);
    
        
        if (currentTime <= last_intake_time.subtract(60, 'minutes')){
            
            //Annullare alert successivo --> update della startDateTime
            for (let a=0; a < reminder_idToUpdate.length; a++)  {
                
                let confirmationTokenToUpdate = reminder_idToUpdate[a].confirmationToken;
                
                let alertTokenToUpdate = reminder_idToUpdate[a].alertToken;
                 
                //prendiamo il body del vecchio reminder tramite AlertToken
                const oldReminderConfirmation = await reminderApiClient.getReminder(confirmationTokenToUpdate);
                
                const oldReminderAlert = await reminderApiClient.getReminder(alertTokenToUpdate);
                
                //startDateTime la aggiorniamo impostandola un'ora dopo la richiesta
                let newTime = moment().add(1, 'hours').tz('Europe/Rome').format('YYYY-MM-DDTHH:mm:ss'); 
                
                //modifico il body sostituendo la startDateTime
                oldReminderConfirmation.trigger.recurrence.startDateTime = newTime;
                
                let endNewC = oldReminderConfirmation.trigger.recurrence.endDateTime;
                //let endNewC = moment(oldReminderConfirmation.trigger.recurrence.endDateTime).timezone.format('YYYY-MM-DDTHH:mm:ss');
              
                //oldReminderConfirmation.trigger.recurrence.endDateTime = endNewC.split(".")[0];
                let AdjustedEndNewC = logic.convertDateFromDatabase(endNewC);
                
                let AdjustedEndNewC2 = logic.convertDateForDatabase(AdjustedEndNewC);
                
                let AdjustedEndNewC3 = AdjustedEndNewC2.toISOString().split(".")[0];
                
                oldReminderConfirmation.trigger.recurrence.endDateTime = AdjustedEndNewC3;
                
                oldReminderAlert.trigger.recurrence.startDateTime = newTime;
                let endNewA = oldReminderAlert.trigger.recurrence.endDateTime;
                //let endNewA = moment(oldReminderAlert.trigger.recurrence.endDateTime).timezone.format('YYYY-MM-DDTHH:mm:ss');
                
                //oldReminderAlert.trigger.recurrence.endDateTime = endNewA.split(".")[0];
                let AdjustedEndNewA = logic.convertDateFromDatabase(endNewA);
                
                let AdjustedEndNewA2 = logic.convertDateForDatabase(AdjustedEndNewA);
                
                let AdjustedEndNewA3 = AdjustedEndNewA2.toISOString().split(".")[0];
                
                oldReminderAlert.trigger.recurrence.endDateTime = AdjustedEndNewA3;
               
                
                let newReminderAlert = await reminderApiClient.updateReminder(alertTokenToUpdate, oldReminderAlert);
                let newReminderConfirmation = await reminderApiClient.updateReminder(confirmationTokenToUpdate, oldReminderConfirmation);

            }
        }
        else if (currentTime > last_intake_time.subtract(60, 'minutes')){
           
           
            //Annullare alert successivo
            for (let a=0; a < reminder_idToUpdate.length; a++)  {
                let confirmationTokenToDelete = reminder_idToUpdate[a].confirmationToken;
                let alertTokenToDelete = reminder_idToUpdate[a].alertToken;
                //confirmation_token
                try{
                await reminderApiClient.deleteReminder(confirmationTokenToDelete);
                }
                catch (error) {
                    console.log("confirmation token not existing")
                }
                //alert_token
                try{
                await reminderApiClient.deleteReminder(alertTokenToDelete);
                }
                catch (error) {
                    console.log("alert token not existing")
                }
            }
        }
        
        
        // Post logs
        let typeOfAccess = 'Yes Intent';
        let logResponse = await logic.postLogs(access_token, typeOfAccess);
        console.log('logresponse   ' + logResponse)
        //modifica all_therapies da sessione 
        let list_therapies = sessionAttributes['all_therapies'];
        let medicineIndex = list_therapies.findIndex(medicine => medicine._id === intervalTherapy_id);

        let intakeIndex = list_therapies[medicineIndex].intakes.findIndex(intake => intake._id === intake_id);

        list_therapies[medicineIndex].intakes[intakeIndex].status = status;
        sessionAttributes['all_therapies'] = list_therapies;

        if( count_intakes >= list_interval_intakes.length -1) {
            count_intakes = 0;
            sessionAttributes['count_intakes'] = count_intakes;
            
            const speakOutput = 'Ok! Ho segnato la tua medicina come presa! Ho registrato tutto per ora!'
            sessionAttributes['list_interval_intakes'] = [];
            return handlerInput.responseBuilder
                .speak(speakOutput)
                //.reprompt()
                .getResponse();
        }
        
        count_intakes++;
        sessionAttributes['count_intakes'] = count_intakes;
        sessionAttributes['signed_medicine_MSG'] = `Ok! Ho segnato la tua medicina come presa!`;
        
        return WhichMedicineIntentHandler.handle(handlerInput) 
    }
};


const NoIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.NoIntent';
    },
    handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        let count_intakes = sessionAttributes['count_intakes'];
        let list_interval_intakes = sessionAttributes['list_interval_intakes'];
        
        if( count_intakes >= list_interval_intakes.length-1) {
            count_intakes = 0;
            sessionAttributes['count_intakes'] = count_intakes;
            
            const speakOutput = 'Ok! Ho segnato la tua medicina come non presa! Ho registrato tutto per ora!'
            sessionAttributes['list_interval_intakes'] = [];
            return handlerInput.responseBuilder
                .speak(speakOutput)
                //.reprompt()
                .getResponse();
        }
        count_intakes ++;
        sessionAttributes['count_intakes'] = count_intakes;
        sessionAttributes['signed_medicine_MSG'] = `Ok! ho segnato la tua medicina come non presa!`;
        
        return WhichMedicineIntentHandler.handle(handlerInput);
    }
};

const RequestMissedIntakesIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RequestMissedIntakesIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        let access_token = sessionAttributes['access_token'];
        const timezone = "Europe/Rome";
        let start_date = logic.convertDateForDatabase(moment().set({'hour': 0, 'minute': 1}).tz(timezone));
        let end_date = logic.convertDateForDatabase(moment().tz(timezone));

        let therapiesChecked= await logic.getTherapies(access_token, start_date, end_date);
        const dailyTherapies=therapiesChecked.all_therapies;
        let dailyIntakes = [];
        let phrasemissedintakes = '';
        let speakOutput= '';
        for (let it = 0; it < dailyTherapies.length; it++)  {
            dailyIntakes = dailyIntakes.concat(dailyTherapies[it].intakes);
        }
        
        let missedDailyIntakes = dailyIntakes.filter(intake => intake.status === 'programmed');
        if(missedDailyIntakes.length===0){
            speakOutput= 'Complimenti! Oggi hai preso tutte le medicine programmate fino a questo momento!'
        }
        else {
        for (let x=0; x < missedDailyIntakes.length; x++)  {
            let missedIntakeName = missedDailyIntakes[x].drug.split("-")[0];
            let missedIntakePosology = missedDailyIntakes[x].posology;
            let missedIntakeTime = logic.convertDateFromDatabase(missedDailyIntakes[x].programmed_date);
            let missedIntakeHour = missedIntakeTime.hour();
            let missedIntakeMinute = missedIntakeTime.minute();
            let missedIntakeMoment = missedIntakeHour+':'+missedIntakeMinute;
            phrasemissedintakes = phrasemissedintakes + 'non hai preso: '+missedIntakePosology+' di '+missedIntakeName+' alle ore '+missedIntakeMoment+'; ';
        }
        let numberMissedIntake = missedDailyIntakes.length;

        speakOutput = 'Ciao! Oggi hai dimenticato di prendere '+numberMissedIntake+' medicinali. Nello specifico '+phrasemissedintakes;
        }
        
        // Post logs
        let typeOfAccess = 'Request Missed Intakes Intent';
        let logResponse = await logic.postLogs(access_token, typeOfAccess);
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};

const RequestAdherenceIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'RequestAdherenceIntent';
    },
    async handle(handlerInput) {
        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        let access_token = sessionAttributes['access_token'];
        
        const dataForAdherence = await logic.getTherapiesForAdherence(access_token);
        const adherence = dataForAdherence.adherence;
        let speakOutput = '';
        
        // DISCUTERE SU QUESTI DATI
        if (adherence < 30) {
            speakOutput = `Attenzione! La tua aderenza alle terapie in questo momento è del ${adherence} %. è un dato molto basso, cerca di fare più attenzione. `; }
        else if (adherence < 80) {
            speakOutput = `La tua aderenza alle terapie in questo momento è del ${adherence} %.`; }
        else if (adherence >= 80) {
            speakOutput = `Grande! La tua aderenza alle terapie in questo momento è del ${adherence} %.`; }
        else {
            speakOutput = `Non riesco ad accedere ai tuoi dati di aderenza.`
        }

        // Post logs
        let typeOfAccess = 'Request Adherence Intent';
        let logResponse = await logic.postLogs(access_token, typeOfAccess);
        
        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};
// ALEXA CHIEDI A MEDICO VIRTUALE DI CANCELLARE TUTTI I DATI IN SESSIONE
const DeleteDataSessionIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'DeleteDataSessionIntent';
    },
    handle(handlerInput) {

        const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
        delete sessionAttributes['access_token'];
        delete sessionAttributes['name'];
        delete sessionAttributes['reminders'];
        delete sessionAttributes['list_interval_intakes'];
        delete sessionAttributes['count_intakes'];
        delete sessionAttributes['signed_medicine_MSG'];
        delete sessionAttributes['all_therapies'];
        delete sessionAttributes['edit_therapies'];
        delete sessionAttributes['new_therapies'];
        delete sessionAttributes['updated_therapies'];
        delete sessionAttributes['count_new_therapies'];
        delete sessionAttributes['count_updated_therapies'];
        delete sessionAttributes['therapies'];
        
        const speakOutput = 'Ho eliminato TUTTI i dati in sessione!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};
const HelpUserIntent = {
   canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'HelpUserIntent';
    },
    handle(handlerInput, error) {
        const speakOutput = 'Ciao, puoi chiedermi: 1 Alexa, apri medico virtuale, per controllare e impostare le tue terapie, 2 Alexa, chiedi a medico virtuale di segnarsi le medicine, \
        dopo che hai preso le medicine, 3 Alexa, quali medicine devo prendere oggi, per sapere che medicine devi prendere ,4 Alexa, chiedi a medico virtuale se ho dimenticato di dei farmaci, per sapere se hai dimenticato delle medicine, \
        5 alexa, qual è la mia aderenza, per sapere la tua percentuale di aderenza alle terapie, 6 alexa, cancella tutti i dati in sessione, per eliminare tutti \
        i tuoi dati su alexa ma stai attento';
     

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Ciao, come posso aiutarti?';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speakOutput = 'Ciao, alla prossima!';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .getResponse();
    }
};
/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speakOutput = 'Sorry, I don\'t know about that. Please try again.';

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};
/* *
 * The intent reflector is used for interaction model testing and debugging.
 * It will simply repeat the intent the user said. You can create custom handlers for your intents 
 * by defining them above, then also adding them to the request handler chain below 
 * */
const IntentReflectorHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest';
    },
    handle(handlerInput) {
        const intentName = Alexa.getIntentName(handlerInput.requestEnvelope);
        const speechText = `You just triggered ${intentName}`;

        return handlerInput.responseBuilder
            .speak(speechText)
            //.reprompt('add a reprompt if you want to keep the session open for the user to respond')
            .getResponse();
    }
};
/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        const speakOutput = 'Scusa, ho avuto un problema nella risposta alla tua richiesta.';
        console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);

        return handlerInput.responseBuilder
            .speak(speakOutput)
            .reprompt(speakOutput)
            .getResponse();
    }
};

/**
 * This handler acts as the entry point for your skill, routing all request and response
 * payloads to the handlers above. Make sure any new handlers or interceptors you've
 * defined are included below. The order matters - they're processed top to bottom 
 * */
exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        SecurityCodeIntentHandler,
        LoadTherapiesIntentHandler,
        SayTherapyIntentHandler,
        CreateTherapyIntentHandler,
        ModifyTherapyIntentHandler,
        WhichMedicineTodayIntent,
        ConfirmIntakeIntentHandler,
        WhichMedicineIntentHandler,
        YesIntentHandler,
        NoIntentHandler,
        RequestMissedIntakesIntentHandler,
        RequestAdherenceIntentHandler,
        DeleteDataSessionIntentHandler,
        HelpUserIntent,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler,
        IntentReflectorHandler)
    .addErrorHandlers(
        ErrorHandler)
    .addRequestInterceptors(
        interceptors.LoadAttributesRequestInterceptor)
    .addResponseInterceptors(
        interceptors.SaveAttributesResponseInterceptor)
    .withPersistenceAdapter(util.getPersistenceAdapter())
    .withApiClient(new Alexa.DefaultApiClient())
    .withCustomUserAgent('sample/hello-world/v1.2')
    .lambda();