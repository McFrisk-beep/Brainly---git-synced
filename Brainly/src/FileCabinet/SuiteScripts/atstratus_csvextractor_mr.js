/**
 * @NApiVersion 2.x
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
define(['N/record', 'N/search', 'N/runtime', 'N/file', 'N/xml', 'N/currency', 'N/format'],
/**
 * @param {record} record
 * @param {search} search
 */
function(record, search, runtime, file, xml, currency, format) {
    /**
     * Marks the beginning of the Map/Reduce process and generates input data.
     *
     * @typedef {Object} ObjectRef
     * @property {number} id - Internal ID of the record instance
     * @property {string} type - Record type id
     *
     * @return {Array|Object|Search|RecordRef} inputSummary
     * @since 2015.1
     */
    function getInputData() {
        try{
            // Script parameters for use of the script
            var currentScript = runtime.getCurrentScript();
            var folderID = currentScript.getParameter({
                name: 'custscript_folder_id'
            });

            // Search for the files inside the referenced folder from the script parameter.
            var fileSearchObj = search.create({
               type: "file",
               filters:
               [
                  ["folder","anyof",folderID]
               ],
               columns:
               [
                  search.createColumn({
                     name: "name",
                     sort: search.Sort.ASC,
                     label: "Name"
                  }),
                  search.createColumn({name: "internalid", label: "Internal ID"}),
                  search.createColumn({name: "folder", label: "Folder"}),
                  search.createColumn({name: "documentsize", label: "Size (KB)"}),
                  search.createColumn({name: "url", label: "URL"}),
                  search.createColumn({name: "filetype", label: "Type"})
               ]
            });
            log.audit("Bank files to process",fileSearchObj.runPaged().count);

            return fileSearchObj;
        }
        catch(e){
            log.error('Error in getInputData', e);
        }
    }

    /**
     * Executes when the map entry point is triggered and applies to each key/value pair.
     *
     * @param {MapSummary} context - Data collection containing the key/value pairs to process through the map stage
     * @since 2015.1
     */
    function map(context) {
        try{
            // Display results
            var searchResult = JSON.parse(context.value);
            log.debug('File to load (Internal ID)', searchResult.id);

            // Load the file
            var bankFile = file.load({ id: searchResult.id});
            //Process the XML File
            var xmlFileContent = bankFile.getContents();
            var xmlDocument = xml.Parser.fromString({
                text: xmlFileContent
            });
            var bankNode = xml.XPath.select({
                node: xmlDocument,
                xpath: '//Stmt/Ntry'
            });
            log.debug('xmlFileContent', xmlFileContent);
            log.debug('xmlDocument', xmlDocument);
            log.debug('bankNode', bankNode);

            //for(var x = 0; x < 1; x++) {
            for (var x = 0; x < bankNode.length; x++) {
                log.debug('XML Content', bankNode[x].textContent);
                //Required variables for the custom record
                var vendorSupplier;
                var bankNumber;
                var vendorBankAccount;
                var address;
                var paymentDate;
                var paymentType;    //UNKNOWN
                var reference;
                var referenceNumber;
                var transferAmt;
                var transferCurrency;
                var transferExchangeRate;   //Sourced form Transaction Date
                var fromCurrency;    //Assumed from "transferCurrency"
                var toCurrency;  //Currently assumed value (EUR)
                var loadReference;   //UNKNOWN
                var brainlyBankAccount;  //Customer Input needed
                var subsidiary;

                //Get the Vendor
                vendorSupplier = checkNull(bankNode[x].getElementsByTagName({ tagName: 'Nm'}), 0);
                var vendorNameSplit = vendorSupplier.split(' ');    //Split the blank
                /*
                Try and match the vendor name with something in NetSuite
                We'll try and increment by words until only one result shows up.
                The stuff that we can get from the Saved Search, and IF the vendor matches are the following,

                - Vendor (duh)
                - Subsidiary
                - To Currency (which is the primary currency)
                */
                for(var y = 0; y < vendorNameSplit.length; y++){
                    //vendorNameSplit[y];
                }

                var vendorSearchObj = search.create({
                    type: "vendor",
                    filters:
                    [
                       ["entityid","contains","slack"]
                    ],
                    columns:
                    [
                       search.createColumn({
                          name: "entityid",
                          sort: search.Sort.ASC,
                          label: "Name"
                       }),
                       search.createColumn({name: "email", label: "Email"}),
                       search.createColumn({name: "subsidiary", label: "Primary Subsidiary"}),
                       search.createColumn({name: "currency", label: "Currency"})
                    ]
                 });
                 var searchResultCount = vendorSearchObj.runPaged().count;
                 log.debug("vendorSearchObj result count",searchResultCount);
                 vendorSearchObj.run().each(function(result){
                    // .run().each has a limit of 4,000 results
                    return true;
                 });

                bankNumber = checkNull(bankNode[x].getElementsByTagName({ tagName: 'CdtrAcct'}), 0);
                //Bank Name, to be added along with bank number
                bankNumber += ' ' + checkNull(bankNode[x].getElementsByTagName({ tagName: 'Nm'}), 1);
                
                // var bankNumberNode = xml.XPath.select({
                //     node: xmlDocument,
                //     xpath: '//Stmt/Ntry/NtryDtls/TxDtls/RltdPties/CdtrAcct/Id'
                // });
                // log.debug('bankNumberNode', bankNumberNode[x].childNodes[0]);

                //Vendor Bank Account
                var vendorBankNode = xml.XPath.select({
                    node: xmlDocument,
                    xpath: '//Stmt/Id'
                });
                vendorBankAccount = checkNull(vendorBankNode, 0);
                
                //Getting data from the CSV
                address = checkNull(bankNode[x].getElementsByTagName({ tagName: 'PstlAdr'}), 0);
                paymentDate = checkNull(bankNode[x].getElementsByTagName({ tagName: 'Dt'}), 0);
                reference = checkNull(bankNode[x].getElementsByTagName({ tagName: 'NtryRef'}), 0);
                referenceNumber = checkNull(bankNode[x].getElementsByTagName({ tagName: 'AcctSvcrRef'}), 0);
                transferAmt = checkNull(bankNode[x].getElementsByTagName({ tagName: 'Amt'}), 0);

                var AmtNode = xml.XPath.select({
                    node: xmlDocument,
                    xpath: '//Stmt/Ntry/NtryDtls/TxDtls/AmtDtls/TxAmt/Amt'
                });
                transferCurrency = AmtNode[0].getAttribute({ name: 'Ccy'});

                /*******DATE CONVERSION************/
                var storeDate = paymentDate;
                var marker = false;
                var outsideCtr = 0;
                var year = '';
                var month = '';
                var day = '';
                for(var ctr = 0; ctr < storeDate.length; ctr++){
                    if(storeDate[ctr] != '-'){
                        if(outsideCtr == 0)
                            year += storeDate[ctr];
                        else if(outsideCtr == 1)
                            month += storeDate[ctr];
                        else if(outsideCtr == 2)
                            day += storeDate[ctr];
                    }
                    else{
                        outsideCtr++;
                    }
                }
                storeDate = month + '/' + day + '/' + year;
                var exchangeDate = new Date(storeDate);
                month = exchangeDate.getMonth()+1;
                day = exchangeDate.getDate();
                year = exchangeDate.getFullYear();
                exchangeDate = month + '/' + day + '/' + year;
                exchangeDate = format.parse({ value: exchangeDate, type: format.Type.DATE});
                log.debug('POST PROCESSING', exchangeDate);
                /*******END DATE CONVERSION**********/

                paymentDate = exchangeDate;
                transferExchangeRate = currency.exchangeRate({
                    source: transferCurrency,
                    target: 'EUR',
                    date: exchangeDate
                });

                fromCurrency = transferCurrency;
                toCurrency = 'EUR';


                /****************SANITY TESTING***************/
                log.debug('vendorSupplier', vendorSupplier);
                log.debug('bankNumber', bankNumber);
                log.debug('vendorBankAccount', vendorBankAccount);
                log.debug('address', address);
                log.debug('paymentDate', paymentDate);
                log.debug('reference', reference);
                log.debug('referenceNumber', referenceNumber);
                log.debug('transferAmt', transferAmt);
                log.debug('transferCurrency', transferCurrency);
                log.debug('transferExchangeRate', transferExchangeRate);
                log.debug('fromCurrency', fromCurrency);
                log.debug('toCurrency', toCurrency);
                log.debug('===END ITERATION===');


                //Create the transaction record/Bill payment
                var createStatus = createBankRecord(
                    vendorSupplier,
                    bankNumber,
                    vendorBankAccount,
                    address,
                    paymentDate,
                    paymentType,
                    reference,
                    referenceNumber,
                    transferAmt,
                    transferCurrency,
                    transferExchangeRate,
                    fromCurrency,
                    toCurrency,
                    loadReference,
                    brainlyBankAccount,
                    subsidiary
                    );
                log.debug('Bank Statement Creation status', createStatus);
            }

            //Transfer successful processing to DONE PROCESSING
            moveFile(bankFile, true);
        }
        catch(e){
            log.error('Error in map', e);
            // Transfer failed file to FAILED TO PROCESS
            moveFile(bankFile, false);
        }
    }

    //Not being used, but future developers can make use of this is needed.
    function reduce(context) {
        //___\(^-^)/___~at your service, developer-san! はい、どうぞよろしくお願いいたします！
    }

    /**
     * Executes when the summarize entry point is triggered and applies to the result set.
     *
     * @param {Summary} summary - Holds statistics regarding the execution of a map/reduce script
     * @since 2015.1
     */
    function summarize(summary) {
    	//Summarize the data from the MAP/Reduce. For logging purposes.
    	log.audit('Summary Data', summary);
        log.audit({
            title: 'Usage units consumed', 
            details: summary.usage
        });
        log.audit({
            title: 'Concurrency',
            details: summary.concurrency
        });
        log.audit({
            title: 'Number of yields', 
            details: summary.yields
        });
    }

    return {
        getInputData: getInputData,
        map: map,
        summarize: summarize
    };


    /************************CUSTOM FUNCTIONS*********************************/

    /*
    params:
        bankFile - file object
        status - true = 'success', false = 'failed'
    */
    function moveFile(bankFile, status){
        try{
            // Script parameters for use of the script
            var currentScript = runtime.getCurrentScript();
            var failedFolderID = currentScript.getParameter({
                name: 'custscript_folder_failed_id'
            });
            var successFolderID = currentScript.getParameter({
                name: 'custscript_folder_done_id'
            });

            // Check status passed on parameter and put file in appropriate folder.
            if(status){
                bankFile.folder = successFolderID;
            }
            else{
                bankFile.folder = failedFolderID;
            }
            bankFile.save();
        }
        catch(e){
            log.error('Error occured in moveFile', e);
        }
    }

    /*
    params:
    */
    function createBankRecord(
        vendorSupplier,
        bankNumber,
        vendorBankAccount,
        address,
        paymentDate,
        paymentType,
        reference,
        referenceNumber,
        transferAmt,
        transferCurrency,
        transferExchangeRate,
        fromCurrency,
        toCurrency,
        loadReference,
        brainlyBankAccount,
        subsidiary
        ){
        try{

            var bankRecord = record.create({
                   type: 'customrecord_at_bankstatement',
                   isDynamic: true
               });

            toCurrency = currencyAssignment(toCurrency);
            fromCurrency = currencyAssignment(fromCurrency);
            transferCurrency = currencyAssignment(transferCurrency);
            // log.debug('toCurrency', toCurrency);
            // log.debug('fromCurrency', fromCurrency);
            // log.debug('transferCurrency', transferCurrency);

            //Currently testing
            bankRecord.setValue({ fieldId: 'custrecord_vendor', value: '2794'});  //This is inconsistent
            bankRecord.setValue({ fieldId: 'custrecord_banknumber', value: bankNumber});
            bankRecord.setValue({ fieldId: 'custrecord_vendorbankaccount', value: vendorBankAccount});
            bankRecord.setValue({ fieldId: 'custrecord_address', value: address});
            bankRecord.setValue({ fieldId: 'custrecord_paymentdate', value: paymentDate});
            bankRecord.setValue({ fieldId: 'custrecord_paymenttype', value: paymentType});
            bankRecord.setValue({ fieldId: 'custrecord_reference', value: reference});
            bankRecord.setValue({ fieldId: 'custrecord_referencenumber', value: referenceNumber});
            bankRecord.setValue({ fieldId: 'custrecord_transferamount', value: transferAmt});
            bankRecord.setValue({ fieldId: 'custrecord_transfercurrency', value: transferCurrency});
            bankRecord.setValue({ fieldId: 'custrecord_transferexchangerate', value: transferExchangeRate});
            bankRecord.setValue({ fieldId: 'custrecord_fromcurrency', value: fromCurrency});
            bankRecord.setValue({ fieldId: 'custrecord_tocurrency', value: toCurrency});
            bankRecord.setValue({ fieldId: 'custrecord_loadreference', value: loadReference});
            bankRecord.setValue({ fieldId: 'custrecord_brainlybankaccount', value: brainlyBankAccount});
            bankRecord.setValue({ fieldId: 'custrecord_subsidiary', value: subsidiary});

            bankRecord.save({
                enableSourcing: true,
                ignoreMandatoryFields: true
            });

            return true;
        }
        catch(e){
            log.error('Error occured in createBankRecord', e);
            return false;
        }
    }

    /*
    params:
        currData - Currency to be converted to the NetSuite equivalent internal ID
    */
    function currencyAssignment(currData){
        switch(currData){
            case 'CAD':
                currData = 3;
                break;
            case 'EUR':
                currData = 4;
                break;
            case 'GBP':
                currData = 2;
                break;
            case 'IDR':
                currData = 7;
                break;
            case 'INR':
                currData = 8;
                break;
            case 'PHP':
                currData = 9;
                break;
            case 'PLN':
                currData = 5;
                break;
            case 'RUB':
                currData = 6;
                break;
            case 'USD':
                currData = 1;
                break;
            default:
                currData = -1;    //Invalid. Returns an error when a value is assigned.
                break;
        }
        return currData;
    }

    /*
    params:
        testValue - The value to be checked to confirm if there is a value.
        True means that there is a value,
        False returns a blank value

        index - Index to be extracted

        DEV NOTE: Important function as the XML file is inconsistent.
        Checking if there's values beforehand ensures that the script will not stall on errors.
    */
    function checkNull(testValue, index){
        if(testValue.length){
            return testValue[index].textContent;
        }
        else{
            return '';
        }
    }
});
