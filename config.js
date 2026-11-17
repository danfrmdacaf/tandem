/* Public settings. The address below is a web address, not a credential: it points to the small server
   function that stores the calendars. No database key or password is ever placed in this application. */
window.TANDEM_CONFIG = {
  api: "https://dpfeyzxfccxferiwvgrc.supabase.co/functions/v1/tandem",
  /* The public half of the key that signs reminders. It cannot be used to send anything. */
  vapid: "BHH_sV9T_S-Cmf5I0RdmzKFlAcuATQUKWJWD-8uakMkZjbf6Ut2tS1bxBPyh1vV2IPlS7C3pkHPN47m96HfOhlA"
};
