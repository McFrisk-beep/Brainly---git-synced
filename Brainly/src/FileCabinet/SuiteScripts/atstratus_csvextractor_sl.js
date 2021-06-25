/**
 * @NApiVersion 2.x
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 */
 define(['N/record', 'N/runtime', 'N/search', 'N/ui/serverWidget', 'N/url', 'N/ui/dialog', 'N/task', 'N/redirect'],
 /**
  * @param {record} record
  * @param {runtime} runtime
  * @param {search} search
  * @param {serverWidget} serverWidget
  */
 function(record, runtime, search, serverWidget, url, dialog, task, redirect) {
     
     /**
      * Definition of the Suitelet script trigger point.
      *
      * @param {Object} context
      * @param {ServerRequest} context.request - Encapsulation of the incoming request
      * @param {ServerResponse} context.response - Encapsulation of the Suitelet response
      * @Since 2015.2
      */
     
     function onRequest(context) {
         //When Suitelet is opened.
         var currentScript = runtime.getCurrentScript();
         var onDemandDeployment = currentScript.getParameter({
             name: 'custscript_ondemand_id'
         });
 
         if(context.request.method == 'GET'){
             var form = serverWidget.createForm({
                 title: 'Bank Statement Upload',
                 hideNavBar: false
             });
             form.addSubmitButton({
                 label: 'Submit'
             });
             var noteGroup = form.addFieldGroup({
                 id : 'notes',
                 label: 'Notes'
             });
             var mainGroup = form.addFieldGroup({
                 id: 'main',
                 label: 'Upload XML File'
             });
 
             var obJResult = form.addField
             ({
                 id : 'custpage_result',
                 label : 'Result',
                 type : 'inlinehtml',
                 container: 'notes'
             });
 
             obJResult.defaultValue = '<style>p{ font-size: 14px; } li{ font-size: 14px; }</style><p>Upload file in this window. This page processes one XML at a time.'
             + '<br>Clicking <b>Submit</b> will automatically process the Bank Statement.</p>'
             + '<p>For bulk processing,</p><ul>    <li style="list-style-type: none;">        <ol>            '
             + '<br><li>Navigate to Documents &gt; Files &gt; File Cabinet &gt; Bank Files Import &gt; To Process.</li>            '
             + '<li>Upload the files in ZIP format (More information found <a href="/app/help/helpcenter.nl?fid=section_n542268.html" target="_blank">here</a>).<br>'
             + '<br><i>A back-end script will process data every 4-hours. However, users can run the script manually for urgent processing.&nbsp;'
             + 'The steps below detail on running the script manually.</i><br><br></li>            <li>'
             + 'Click <a href="/app/common/scripting/scriptrecord.nl?id=' + onDemandDeployment + '" target="_blank">here</a> to access the Deployment record of the script.</li>            '
             + '<li>Hover on the drop-down menu before the <i>Save</i> button.</li>            '
             + '<li>Click <b>Save and Execute</b>.</li>            '
             + '<li>On the execution page, await for the script status to display <b>Complete</b>.</li>            '
             + '<li>Should there be no issues encountered, the Vendor Bills should now be automatically matched and generated.</li>        </ol>    </li></ul>'
             + '<br><p><b>IMPORTANT:&nbsp;</b>Re-name files accordingly to avoid duplicate files from being overwritten causing losses in data.</p>'
             + '<br><hr><p><b>DEVELOPER NOTE:&nbsp;</b>Currently in active development. Not all features are fully working at this time. To be removed upon completion.</p>';
 
             // obJResult.defaultValue = '<html><p style="font-size:12px">Upload the file in this window.'
             // + '<br><a href="/app/help/helpcenter.nl?fid=section_n542268.html" target="_blank">click here</a><br>'
             // + '<br><a href="/app/common/scripting/scriptrecord.nl?id=' + onDemandDeployment + '" target="_blank">script</a><br>'
             // + '<br>Clicking submit will also automatically process the bank statement.'
             // + '<br>For bulk processing, navigate to Documents > Files > File Cabinet > Bank Files Import > To Process<br>'
             // + '<br><b>IMPORTANT: Rename files accordingly to avoid duplicate uploads</b>'
             // + '</p></html>';
 
             form.addField({
                 id: 'custpage_uploadfile',
                 label: 'Bank Statement Upload',
                 type: serverWidget.FieldType.FILE,
                 container: 'main'
             });
 
             var fldUpload = form.getField('custpage_uploadfile');
             fldUpload.isMandatory = true;
 
             //render page.
             context.response.writePage(form);
         }
         else if(context.request.method == 'POST'){
             //on successful changes, render this page.
             // var collectionNote = context.request.parameters.custpage_enternote;
             // var req = context.request;
             // req.getSublistValue({group: 'custpage_collectionnotes',name: 'custpage_invoice',line: x});
 
             var currentScript = runtime.getCurrentScript();
             var uploadFolderID = currentScript.getParameter({
                 name: 'custscript_upload_folder_id'
             });
             var mapReduceID = currentScript.getParameter({
                 name: 'custscript_mr_scriptid'
             });
             var mapReduceDeploymentID = currentScript.getParameter({
                 name: 'custscript_mr_deploymentid'
             });
             
             try{
                 var fileObj = context.request.files.custpage_uploadfile;
                 fileObj.folder = uploadFolderID;
                 var id = fileObj.save();
 
                 var mapReduceTask = task.create({
                     taskType: task.TaskType.MAP_REDUCE,
                     scriptId: mapReduceID,
                     deploymentId: mapReduceDeploymentID,
                 });
 
                 var mapReduceId = mapReduceTask.submit();
 
                 var form = serverWidget.createForm({
                     title: 'File uploaded and unpacked by the script.',
                     hideNavBar: false
                 });
                 var obJResult = form.addField
                 ({
                     id : 'custpage_result',
                     label : 'Result',
                     type : 'inlinehtml'
                    });
 
                var newlyCreatedSearch = currentScript.getParameter({
                    name: 'custscript_recent_rec_ss_url'
                });
                var mrScriptID = currentScript.getParameter({
                    name: 'custscript_mr_scriptid'
                });
                 obJResult.defaultValue = '<html>Please wait for a couple of minutes for the script to process the upload and record creation.'
                 + '<br>To check for the status of the script, please click <a href="/app/common/scripting/mapreducescriptstatus.nl?daterange=TODAY&scripttype=' + mrScriptID +'" target="_blank">here</a>.'
                 + '<br>To see the created records for today, please click <a href="' + newlyCreatedSearch + '" target="_blank">here</a>.'
                 + '<br>Feel free to close this window.<br><br></html>';
             }
             catch(e){
                 var form = serverWidget.createForm({
                     title: 'Another Task is currently saving.',
                     hideNavBar: true
                 });
                 var obJResult = form.addField
                 ({
                     id : 'custpage_result',
                     label : 'Result',
                     type : 'inlinehtml'
                    });
                 obJResult.defaultValue = '<html>There is another instance of this script currently running.'
                 + 'Please wait for a couple of minutes for the current task to save before trying again.'
                 + '<br>To check for the status of the script, please click here <a href="/app/common/scripting/scriptrecordlist.nl?whence=">here</a>.'
                 + '<br>Feel free to close this window.<br><br></html>';
             }
             //redirect.toTaskLink({id:'LIST_SCRIPTSTATUS'});
             context.response.writePage(form);
         }
     }
 
     return {
         onRequest: onRequest
     };
     
 });